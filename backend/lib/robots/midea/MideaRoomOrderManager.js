const fs = require("node:fs");
const Logger = require("../../Logger");
const MSmartConst = require("../../msmart/MSmartConst");
const MSmartPacket = require("../../msmart/MSmartPacket");
const path = require("node:path");
const stateAttrs = require("../../entities/state/attributes");

/**
 * Per-job room order for the J15.
 *
 * The robot ignores the order of the rooms in a room clean (0x03) and sorts them by each room's stored `cleanSeq`
 * instead. So, for a job with a custom order, the `cleanSeq` values of the selected rooms are swapped among themselves
 * to match the clicked order before the job is started, and put back once the job is over.
 *
 * `cleanSeq` is written with 0x2B (record version 2), which overwrites every field of the room, so each record carries
 * the room's current values from room_cfg for everything else. The robot saves room_cfg itself; nothing here writes it.
 *
 * Because the robot-side decoding of those fields is not verified, the first use sends one record that changes nothing
 * and checks that room_cfg still holds the same values afterwards. Every write is read back the same way. If anything
 * doesn't match, the feature switches itself off until that is looked into.
 *
 * The values to put back are persisted next to Valetudo's configuration file, so a restart doesn't lose them.
 */
class MideaRoomOrderManager {
    /**
     * @param {object} options
     * @param {import("./MideaValetudoRobot")} options.robot
     */
    constructor(options) {
        this.robot = options.robot;
        this.enabled = this.robot.config.get("embedded") === true;

        /** @type {{verified: boolean, disabled: string|null, pending: {[roomId: string]: number}}} */
        this.storage = {verified: false, disabled: null, pending: {}};
        this.awaitingJobStart = false;
        this.awaitingJobStartTimeout = undefined;
        this.restoreInProgress = false;

        if (this.enabled) {
            this.storagePath = path.join(path.dirname(this.robot.config.location), STORAGE_FILENAME);
            this.storage = Object.assign(this.storage, this.load());

            if (Object.keys(this.storage.pending).length > 0) {
                Logger.info(`Room order: a restore of cleanSeq is pending from before: ${JSON.stringify(this.storage.pending)}`);
            }

            this.robot.onStateAttributesUpdated(() => {
                this.onStateChanged();
            });
        }
    }

    /**
     * Makes the robot clean the given rooms in the given order. Does nothing when the order already matches.
     *
     * @param {Array<number>} roomIds in the order they should be cleaned
     * @returns {Promise<void>}
     */
    async applyOrder(roomIds) {
        if (!this.enabled) {
            return;
        }
        if (this.storage.disabled) {
            Logger.warn(`Room order: switched off (${this.storage.disabled}). Rooms will be cleaned in the robot's order.`);

            return;
        }
        if (roomIds.length < 2) {
            return;
        }

        const rooms = this.readRooms();
        const originalSeq = (id) => {
            return this.storage.pending[id] ?? rooms[id]?.cleanSeq;
        };

        for (const id of roomIds) {
            if (!rooms[id]) {
                Logger.warn(`Room order: room ${id} is not in room_cfg. Rooms will be cleaned in the robot's order.`);

                return;
            }
            if (!(originalSeq(id) > 0)) {
                // 0 means the robot picks the order itself
                Logger.info(`Room order: room ${id} has cleanSeq ${originalSeq(id)}, so the robot decides the order.`);

                return;
            }
        }

        if (!this.storage.verified) {
            await this.verifyEncoding(rooms[roomIds[0]]);
        }

        // Rooms not in this job go back to their original value, the selected ones share their original values in clicked order
        const desired = {};
        for (const id of Object.keys(this.storage.pending)) {
            desired[id] = this.storage.pending[id];
        }
        const values = roomIds.map(id => {
            return originalSeq(id);
        }).sort((a, b) => {
            return a - b;
        });
        roomIds.forEach((id, i) => {
            desired[id] = values[i];
        });

        const changes = Object.keys(desired).filter(id => {
            return rooms[id] && rooms[id].cleanSeq !== desired[id];
        });

        Logger.info(
            `Room order: wanted [${roomIds.join(", ")}]. cleanSeq before: ` +
            roomIds.map(id => {
                return `${id}=${rooms[id].cleanSeq}`;
            }).join(", ") +
            `. Rooms to change: ${changes.map(id => {
                return `${id} ${rooms[id].cleanSeq}->${desired[id]}`;
            }).join(", ") || "none"}`
        );

        if (changes.length === 0) {
            return;
        }

        for (const id of changes) {
            if (this.storage.pending[id] === undefined) {
                this.storage.pending[id] = rooms[id].cleanSeq;
            }
        }
        this.persist();

        await this.writeAndVerify(changes.map(id => {
            return Object.assign({}, rooms[id], {cleanSeq: desired[id]});
        }));

        // Rooms of an earlier job that this write put back don't need restoring anymore
        for (const id of Object.keys(this.storage.pending)) {
            if (!roomIds.includes(parseInt(id))) {
                delete this.storage.pending[id];
            }
        }
        this.persist();

        this.awaitingJobStart = true;
        clearTimeout(this.awaitingJobStartTimeout);
        this.awaitingJobStartTimeout = setTimeout(() => {
            // In case the job never started, don't wait for it forever
            this.awaitingJobStart = false;
            this.onStateChanged();
        }, JOB_START_TIMEOUT);
    }

    /**
     * Puts back the original cleanSeq values, if any are pending
     *
     * @returns {Promise<void>}
     */
    async restore() {
        const pendingIds = Object.keys(this.storage.pending);
        if (pendingIds.length === 0 || this.restoreInProgress) {
            return;
        }

        this.restoreInProgress = true;
        try {
            const rooms = this.readRooms();
            const changes = pendingIds.filter(id => {
                return rooms[id] && rooms[id].cleanSeq !== this.storage.pending[id];
            });

            Logger.info(`Room order: job over, restoring cleanSeq ${pendingIds.map(id => {
                return `${id}=${this.storage.pending[id]}`;
            }).join(", ")}${changes.length === 0 ? " (already in place)" : ""}`);

            if (changes.length > 0) {
                await this.writeAndVerify(changes.map(id => {
                    return Object.assign({}, rooms[id], {cleanSeq: this.storage.pending[id]});
                }));
            }

            this.storage.pending = {};
            this.persist();
        } catch (e) {
            Logger.error("Room order: restoring cleanSeq failed. It will be retried.", e);
        } finally {
            this.restoreInProgress = false;
        }
    }

    /**
     * @private
     */
    onStateChanged() {
        if (Object.keys(this.storage.pending).length === 0 || this.storage.disabled) {
            return;
        }

        const status = this.robot.state.getFirstMatchingAttributeByConstructor(stateAttrs.StatusStateAttribute);
        if (!status) {
            return;
        }

        const atRest = [
            stateAttrs.StatusStateAttribute.VALUE.DOCKED,
            stateAttrs.StatusStateAttribute.VALUE.IDLE
        ].includes(status.value);

        if (!atRest) {
            this.awaitingJobStart = false;
            clearTimeout(this.awaitingJobStartTimeout);

            return;
        }

        // A job that can still be resumed isn't over yet
        if (!this.awaitingJobStart && status.flag !== stateAttrs.StatusStateAttribute.FLAG.RESUMABLE) {
            this.restore().catch(() => {
                /* logged in restore() */
            });
        }
    }

    /**
     * Sends one record with the room's current values and checks that room_cfg still holds them afterwards
     *
     * @private
     * @param {object} room
     * @returns {Promise<void>}
     */
    async verifyEncoding(room) {
        Logger.info(`Room order: first use, checking the 0x2B encoding with a record that changes nothing (room ${room.id})`);

        await this.writeAndVerify([room]);

        this.storage.verified = true;
        this.persist();

        Logger.info("Room order: 0x2B encoding check passed");
    }

    /**
     * @private
     * @param {Array<object>} wanted room_cfg room entries with the values they should end up with
     * @returns {Promise<void>}
     */
    async writeAndVerify(wanted) {
        const before = fs.statSync(ROOM_CFG_PATH).mtimeMs;

        await this.sendRoomInfo(wanted);

        const deadline = Date.now() + SAVE_TIMEOUT;
        while (Date.now() < deadline && fs.statSync(ROOM_CFG_PATH).mtimeMs === before) {
            await new Promise(resolve => {
                setTimeout(resolve, 250);
            });
        }

        const after = this.readRooms();
        const otherFile = this.readRooms(ROOM_CFG_OTHER_PATH);
        const mismatches = [];

        for (const room of wanted) {
            const stored = after[room.id];

            Logger.info(
                `Room order: room ${room.id} after the write: ${describe(stored)}` +
                ` (${path.basename(ROOM_CFG_OTHER_PATH)}: ${describe(otherFile[room.id])})`
            );

            for (const field of RECORD_FIELDS) {
                if (stored?.[field] !== room[field]) {
                    mismatches.push(`room ${room.id} ${field}: wanted ${room[field]}, got ${stored?.[field]}`);
                }
            }
        }

        if (mismatches.length > 0) {
            this.storage.disabled = `0x2B readback mismatch: ${mismatches.join("; ")}`;
            this.persist();

            Logger.error(`Room order: the robot didn't store what was sent. Switching the feature off. ${mismatches.join("; ")}`);

            throw new Error("The robot didn't store the room order as sent. Room order is now switched off, see the log.");
        }
    }

    /**
     * @private
     * @param {Array<object>} rooms room_cfg room entries
     * @returns {Promise<void>}
     */
    async sendRoomInfo(rooms) {
        const records = Buffer.alloc(rooms.length * RECORD_LENGTH);

        rooms.forEach((room, i) => {
            for (const field of RECORD_FIELDS) {
                const value = room[field];
                if (!Number.isInteger(value) || value < 0 || value > 255) {
                    throw new Error(`Room ${room.id} has an unexpected ${field} value: ${value}`);
                }
            }
            if (room.fanSpeed === 5) {
                // Known to be able to hard-shut the robot
                throw new Error(`Room ${room.id} has fan speed 5, which must never be sent`);
            }

            const offset = i * RECORD_LENGTH;
            records[offset] = room.id;
            records[offset + 1] = room.cleanCount;
            records[offset + 2] = room.vacuum_mop_mode;
            // offset + 3 is not read
            records[offset + 4] = room.fanSpeed;
            records[offset + 5] = room.infinite_water_speed;
            records[offset + 6] = room.cleanSeq;
            records[offset + 7] = room.fluidType;
            records[offset + 8] = room.route_type;
        });

        const payload = Buffer.concat([
            // Version 2 of the record format goes where other commands have 0x01
            Buffer.from([0xaa, 0x02, MSmartConst.SETTING.SET_ROOM_INFO, 0x00, rooms.length, RECORD_LENGTH]),
            records
        ]);

        Logger.info(`Room order: sending 0x2B ${payload.toString("hex")}`);

        const response = await this.robot.sendCommand(new MSmartPacket({
            messageType: MSmartPacket.MESSAGE_TYPE.SETTING,
            payload: payload
        }).toHexString());

        Logger.info(`Room order: 0x2B response payload: ${response?.payload?.toString("hex")}`);
    }

    /**
     * @private
     * @param {string} [filePath]
     * @returns {{[roomId: string]: object}}
     */
    readRooms(filePath = ROOM_CFG_PATH) {
        const rooms = {};

        try {
            const roomCfg = JSON.parse(fs.readFileSync(filePath).toString());

            for (const room of roomCfg.rooms ?? []) {
                rooms[room.id] = room;
            }
        } catch (e) {
            if (filePath === ROOM_CFG_PATH) {
                throw new Error(`Could not read ${filePath}: ${e.message}`);
            }
        }

        return rooms;
    }

    /**
     * @private
     * @returns {object}
     */
    load() {
        try {
            if (fs.existsSync(this.storagePath)) {
                return JSON.parse(fs.readFileSync(this.storagePath).toString());
            }
        } catch (e) {
            Logger.warn("Room order: could not read the stored state", e);
        }

        return {};
    }

    /**
     * @private
     */
    persist() {
        try {
            fs.writeFileSync(this.storagePath, JSON.stringify(this.storage, null, 2));
        } catch (e) {
            Logger.error("Room order: could not store the state", e);
        }
    }
}

/**
 * @param {object} room
 * @returns {string}
 */
function describe(room) {
    if (!room) {
        return "missing";
    }

    return RECORD_FIELDS.map(field => {
        return `${field}=${room[field]}`;
    }).join(" ");
}

const RECORD_FIELDS = ["cleanCount", "vacuum_mop_mode", "fanSpeed", "infinite_water_speed", "cleanSeq", "fluidType", "route_type"];
const RECORD_LENGTH = 10;
const SAVE_TIMEOUT = 5000;
const JOB_START_TIMEOUT = 2 * 60 * 1000;
const STORAGE_FILENAME = "valetudo_midea_room_order.json";
// Same file MideaMapHacksProvider reads the room names from
const ROOM_CFG_PATH = "/oem/slam/room_cfg02.settings";
const ROOM_CFG_OTHER_PATH = "/oem/slam/room_cfg01.settings";

module.exports = MideaRoomOrderManager;

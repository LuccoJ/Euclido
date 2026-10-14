const BEightParser = require("../../msmart/BEightParser");
const capabilities = require("./capabilities");
const dtos = require("../../msmart/dtos");
const entities = require("../../entities");
const Logger = require("../../Logger");
const MideaValetudoRobot = require("./MideaValetudoRobot");
const MSmartConst = require("../../msmart/MSmartConst");
const MSmartPacket = require("../../msmart/MSmartPacket");
const ValetudoSelectionPreset = require("../../entities/core/ValetudoSelectionPreset");

/**
 * @abstract
 */
class MideaModernValetudoRobot extends MideaValetudoRobot {
    /**
     *
     * @param {object} options
     * @param {import("../../Configuration")} options.config
     * @param {import("../../ValetudoEventStore")} options.valetudoEventStore
     * @param {object} [options.waterGrades]
     * @param {object} [options.operationModes]
     * @param {boolean} [options.oldMapPollStyle]
     * @param {boolean} [options.liveMapSession] keep a map session open while active, for live path updates
     */
    constructor(options) {
        super(options);
        this.waterGrades = options.waterGrades ?? MideaModernValetudoRobot.WATER_GRADES;
        this.oldMapPollStyle = !!options.oldMapPollStyle;
        this.liveMapSession = !!options.liveMapSession;
        this.lastMapSessionMessage = 0;

        this.ephemeralState = {
            work_status: undefined,
            error_type: undefined,
            error_desc: undefined,
            job_state: undefined,
            station_error_code: undefined
        };

        this.registerCapability(new capabilities.MideaFanSpeedControlCapabilityV2({
            robot: this,
            presets: Object.keys(this.fanSpeeds).map(k => {
                return new ValetudoSelectionPreset({name: k, value: this.fanSpeeds[k]});
            })
        }));
        this.registerCapability(new capabilities.MideaOperationModeControlCapabilityV2({
            robot: this,
            presets: Object.keys(this.operationModes).map(k => {
                return new ValetudoSelectionPreset({name: k, value: this.operationModes[k]});
            })
        }));
        this.registerCapability(new capabilities.MideaWaterUsageControlCapabilityV2({
            robot: this,
            presets: Object.keys(this.waterGrades).map(k => {
                return new ValetudoSelectionPreset({name: k, value: this.waterGrades[k]});
            })
        }));

        [
            capabilities.MideaLocateCapabilityV2,
            capabilities.MideaBasicControlCapabilityV2,
            capabilities.MideaDoNotDisturbCapabilityV2,
            capabilities.MideaSpeakerVolumeControlCapabilityV2,
            capabilities.MideaMapResetCapabilityV2,
            capabilities.MideaMappingPassCapabilityV2,
            capabilities.MideaMapSegmentEditCapabilityV2,
            capabilities.MideaMapSegmentationCapabilityV2,
            capabilities.MideaZoneCleaningCapabilityV2,
            capabilities.MideaCombinedVirtualRestrictionsCapabilityV2,
            capabilities.MideaKeyLockCapabilityV2,
            capabilities.MideaAutoEmptyDockManualTriggerCapabilityV2,
            capabilities.MideaMopDockCleanManualTriggerCapability,
            capabilities.MideaMopDockDryManualTriggerCapability,
            capabilities.MideaMopDockMopAutoDryingControlCapability,
        ].forEach(capability => {
            this.registerCapability(new capability({robot: this}));
        });

        this.state.upsertFirstMatchingAttribute(new entities.state.attributes.DockStatusStateAttribute({
            value: entities.state.attributes.DockStatusStateAttribute.VALUE.IDLE
        }));


    }



    async pollState() {
        const packet = new MSmartPacket({
            messageType: MSmartPacket.MESSAGE_TYPE.ACTION,
            payload: MSmartPacket.buildPayload(0x01)
        });

        const response = await this.sendCommand(packet.toHexString());
        const parsedResponse = BEightParser.PARSE(response);

        if (parsedResponse instanceof dtos.MSmartStatusDTO) {
            this.parseAndUpdateState(parsedResponse);
        }

        return this.state;
    }

    parseAndUpdateState(data) {
        if (
            data.water_level > 100 && // undefined also happens to be not > 100
            !Object.values(this.waterGrades).includes(data.water_level)
        ) {
            Logger.warn(`Received unknown water grade ${data.water_level}. Normalizing.`);

            this.sendCommand(
                new MSmartPacket({
                    messageType: MSmartPacket.MESSAGE_TYPE.SETTING,
                    payload: MSmartPacket.buildPayload(
                        MSmartConst.SETTING.SET_WATER_GRADE,
                        Buffer.from([
                            Object.values(this.waterGrades).sort((a, b) => {
                                return Math.abs(a - data.water_level) - Math.abs(b - data.water_level);
                            })[0]
                        ])
                    )
                }).toHexString()
            ).catch(e => {
                Logger.warn("Error while normalizing water grade", e);
            });

            return super.parseAndUpdateState(
                new dtos.MSmartStatusDTO(
                    Object.assign(
                        {},
                        data,
                        {water_level: undefined}
                    )
                )
            );
        }

        return super.parseAndUpdateState(data);
    }


    /**
     * Outside of a map session, the robot only sends its full path about every 92s, and that path is also the only
     * source of its position. While a session is open, it sends the map and the newest part of the path about
     * every 2s, for as many ~2s ticks as the countdown says. "start" opens a session and requests a full path,
     * "keepalive" extends it.
     *
     * @private
     */
    keepMapSessionAlive() {
        const status = this.state.getFirstMatchingAttributeByConstructor(entities.state.attributes.StatusStateAttribute);
        if (!status?.isActiveState) {
            return;
        }

        const now = Date.now();
        const sinceLast = now - this.lastMapSessionMessage;
        let command;

        if (sinceLast > MAP_SESSION_COUNTDOWN * 2000) {
            command = "start";
        } else if (sinceLast > MAP_SESSION_KEEPALIVE_INTERVAL) {
            command = "keepalive";
        } else {
            return;
        }

        this.lastMapSessionMessage = now;
        this.mapParser.mapSessionUntil = now + MAP_SESSION_COUNTDOWN * 2000;
        if (command === "start") {
            this.mapParser.expectFullTrack = true;
        }
        Logger.debug(`Sending map session ${command}`);

        this.sendCommand(
            {command: command, countDown: MAP_SESSION_COUNTDOWN},
            {target: "map", protocol: "map", fireAndForget: true}
        ).catch(e => {
            Logger.warn(`Error while sending map session ${command}`, e);
        });
    }

    async executeMapPoll() {
        // TODO: Should these all be new instances every single poll?
        const mapPollPacket = new MSmartPacket({
            messageType: MSmartPacket.MESSAGE_TYPE.ACTION,
            payload: MSmartPacket.buildPayload(MSmartConst.ACTION.POLL_MAP)
        });
        const dockPositionPollPacket = new MSmartPacket({
            messageType: MSmartPacket.MESSAGE_TYPE.ACTION,
            payload: MSmartPacket.buildPayload(MSmartConst.ACTION.GET_DOCK_POSITION)
        });
        const activeZonesPollPacket = new MSmartPacket({
            messageType: MSmartPacket.MESSAGE_TYPE.ACTION,
            payload: MSmartPacket.buildPayload(MSmartConst.ACTION.GET_ACTIVE_ZONES)
        });

        if (this.liveMapSession) {
            this.keepMapSessionAlive();
        }

        if (this.oldMapPollStyle) {
            await this.sendCommand({command: "start"}, {target: "map", fireAndForget: true});
        } else {
            await this.sendCommand(mapPollPacket.toHexString());
        }

        const dockPositionResponse = await this.sendCommand(dockPositionPollPacket.toHexString());
        const parsedDockPositionResponse = BEightParser.PARSE(dockPositionResponse);

        if (parsedDockPositionResponse instanceof dtos.MSmartDockPositionDTO) {
            await this.handleMapUpdate("dockPosition", parsedDockPositionResponse);
        }

        const activeZonesResponse = await this.sendCommand(activeZonesPollPacket.toHexString());
        const parsedActiveZonesResponse = BEightParser.PARSE(activeZonesResponse);

        if (parsedActiveZonesResponse instanceof dtos.MSmartActiveZonesDTO) {
            await this.handleMapUpdate("evt_active_zones", parsedActiveZonesResponse);
        }
    }

    getModelDetails() {
        return Object.assign(
            {},
            super.getModelDetails(),
            {
                supportedAttachments: [
                    entities.state.attributes.AttachmentStateAttribute.TYPE.MOP,
                ],
                supportedDockComponents: [
                    entities.state.attributes.DockComponentStateAttribute.TYPE.WATER_TANK_CLEAN,
                    entities.state.attributes.DockComponentStateAttribute.TYPE.WATER_TANK_DIRTY,
                    entities.state.attributes.DockComponentStateAttribute.TYPE.DUSTBAG,
                ]
            }
        );
    }
}

const MAP_SESSION_COUNTDOWN = 30; // ticks of about 2s
const MAP_SESSION_KEEPALIVE_INTERVAL = 40 * 1000; // ms, well before the countdown runs out

module.exports = MideaModernValetudoRobot;

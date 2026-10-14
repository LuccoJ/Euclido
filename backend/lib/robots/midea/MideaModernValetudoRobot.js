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
     * @param {any} [options.mapSegmentationCapability] replaces MideaMapSegmentationCapabilityV2
     * @param {boolean} [options.liveMapSession] request the full path more often while active
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
            options.mapSegmentationCapability ?? capabilities.MideaMapSegmentationCapabilityV2,
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
     * Outside of a map session, the robot sends its full path, the only source of its position, about every 92s.
     * A "start" message makes it send the full path and the map right away. The countdown is kept at a single tick,
     * so that no session stays open: a longer one doubles the map uploads and, it seems, loads the robot.
     *
     * @private
     */
    requestFullPath() {
        const status = this.state.getFirstMatchingAttributeByConstructor(entities.state.attributes.StatusStateAttribute);
        const now = Date.now();

        if (!status?.isActiveState || now - this.lastMapSessionMessage < FULL_PATH_REQUEST_INTERVAL) {
            return;
        }

        this.lastMapSessionMessage = now;
        Logger.debug("Requesting the full path");

        this.sendCommand(
            {command: "start", countDown: 1},
            {target: "map", protocol: "map", fireAndForget: true}
        ).catch(e => {
            Logger.warn("Error while requesting the full path", e);
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
            this.requestFullPath();
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

const FULL_PATH_REQUEST_INTERVAL = 10 * 1000; // ms

module.exports = MideaModernValetudoRobot;

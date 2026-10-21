const EventEmitter = require("events").EventEmitter;

const AttributeSubscriber = require("../entities/AttributeSubscriber");
const CallbackAttributeSubscriber = require("../entities/CallbackAttributeSubscriber");
const entities = require("../entities");
const ErrorStateValetudoEvent = require("../valetudo_events/events/ErrorStateValetudoEvent");
const Logger = require("../Logger");
const MapFloorNoiseFilter = require("../utils/MapFloorNoiseFilter");
const NotImplementedError = require("./NotImplementedError");
const Semaphore = require("semaphore");
const Tools = require("../utils/Tools");
const ValetudoBasedCapability = require("./capabilities/ValetudoBasedCapability");
const {StatusStateAttribute} = require("../entities/state/attributes");

/**
 * @abstract
 */
class ValetudoRobot {
    /**
     *
     * @param {object} options
     * @param {import("../Configuration")} options.config
     * @param {import("../ValetudoEventStore")} options.valetudoEventStore
     */
    constructor(options) {
        /** @private */
        this.eventEmitter = new EventEmitter();
        this.valetudoEventStore = options.valetudoEventStore;
        this.config = options.config;
        this.capabilities = {};

        this.state = new entities.state.RobotState({
            map: ValetudoRobot.DEFAULT_MAP
        });

        this.flags = {
            lowmemHost: this.config.get("embedded") === true && Tools.IS_LOWMEM_HOST(),
            hugeMap: false
        };

        this.mapPollMutex = Semaphore(1);
        this.mapPollTimeout = undefined;
        this.postActiveStateMapPollCooldownCredits = 0;

        this.initInternalSubscriptions();


        const modelDetails = this.getModelDetails();
        for (const attachmentType of modelDetails.supportedAttachments) {
            this.state.upsertFirstMatchingAttribute(new entities.state.attributes.AttachmentStateAttribute({
                type: attachmentType,
                attached: false
            }));
        }
        for (const dockComponentType of modelDetails.supportedDockComponents) {
            this.state.upsertFirstMatchingAttribute(new entities.state.attributes.DockComponentStateAttribute({
                type: dockComponentType,
                value: entities.state.attributes.DockComponentStateAttribute.VALUE.UNKNOWN
            }));
        }
    }

    /**
     * @public
     */
    clearValetudoMap() {
        this.state.map = ValetudoRobot.DEFAULT_MAP;

        this.emitMapUpdated();
    }

    /**
     *
     * @param {import("./capabilities/Capability")} capability
     */
    registerCapability(capability) {
        if (!this.capabilities[capability.type]) {
            this.capabilities[capability.type] = capability;
        } else {
            throw new Error("Attempted to register more than one capability of type " + capability.type);
        }
    }

    /**
     * @public
     * @param {string} capabilityType
     * @returns {boolean}
     */
    hasCapability(capabilityType) {
        return this.capabilities[capabilityType] !== undefined;
    }

    /**
     * Always polls the latest state from the robot
     *
     * @returns {Promise<import("../entities/state/RobotState")>}
     */
    async pollState() {
        return this.state;
    }

    /**
     * Parses a state update and updates the internal state.
     * Updates might be partial
     *
     * @param {*} data
     */
    parseAndUpdateState(data) {
        throw new NotImplementedError();
    }

    /**
     * @protected
     */
    initInternalSubscriptions() {
        this.state.subscribe(
            new CallbackAttributeSubscriber((eventType, status, prevStatus) => {
                if (
                    //@ts-ignore
                    (eventType === AttributeSubscriber.EVENT_TYPE.ADD && status.value === StatusStateAttribute.VALUE.ERROR) ||
                    (
                        eventType === AttributeSubscriber.EVENT_TYPE.CHANGE &&
                        //@ts-ignore
                        status.value === StatusStateAttribute.VALUE.ERROR &&
                        prevStatus &&
                        //@ts-ignore
                        prevStatus.value !== StatusStateAttribute.VALUE.ERROR
                    )
                ) {
                    this.valetudoEventStore.raise(new ErrorStateValetudoEvent({
                        //@ts-ignore
                        message: status.error?.message ?? "Unknown Error"
                    }));
                }
            }),
            {attributeClass: StatusStateAttribute.name}
        );

        this.onMapUpdated(() => {
            if (this.flags.hugeMap === false && this.state.map.metaData.totalLayerArea >= HUGE_MAP_THRESHOLD) {
                this.flags.hugeMap = true;
            }
        });
    }

    /**
     * This function allows us to inject custom routes into the main webserver
     * Usually, this should never be used unless there are _very_ important reasons to do so
     *
     * @param {any} app The expressjs app instance
     */
    initModelSpecificWebserverRoutes(app) {
        //intentional
    }

    /**
     *
     * @protected
     * @abstract
     * @returns {Promise<any>}
     */
    async executeMapPoll() {
        throw new NotImplementedError();
    }

    /**
     * @protected
     * @param {any} pollResponse Implementation specific
     * @return {number} seconds
     */
    determineNextMapPollInterval(pollResponse) {
        let repollSeconds = ValetudoRobot.MAP_POLLING_INTERVALS.DEFAULT;

        let statusStateAttribute = this.state.getFirstMatchingAttribute({
            attributeClass: StatusStateAttribute.name
        });


        let isActive = false;

        if (statusStateAttribute && statusStateAttribute.isActiveState) {
            isActive = true;
            this.postActiveStateMapPollCooldownCredits = 3;
        }

        if (!isActive && this.postActiveStateMapPollCooldownCredits > 0) {
            // Pretend that we're still in an active state to ensure that we catch map updates e.g. after docking
            isActive = true;
            this.postActiveStateMapPollCooldownCredits--;
        }


        if (isActive) {
            repollSeconds = ValetudoRobot.MAP_POLLING_INTERVALS.ACTIVE;

            if (this.flags.lowmemHost) {
                repollSeconds *= 2;
            }
            if (this.flags.hugeMap) {
                repollSeconds *= 2;
            }
        }

        return repollSeconds;
    }

    /**
     * @public
     * @returns {void}
     */
    pollMap() {
        this.mapPollMutex.take(() => {
            let repollSeconds = ValetudoRobot.MAP_POLLING_INTERVALS.DEFAULT;

            // Clear pending timeout, since we’re starting a new poll right now.
            if (this.mapPollTimeout) {
                clearTimeout(this.mapPollTimeout);

                this.mapPollTimeout = undefined;
            }

            this.executeMapPoll().then((response) => {
                repollSeconds = this.determineNextMapPollInterval(response);
            }).catch((err) => {
                Logger.debug("Error while executing map poll", err);

                repollSeconds = ValetudoRobot.MAP_POLLING_INTERVALS.ERROR;
            }).finally(() => {
                this.mapPollTimeout = setTimeout(() => {
                    this.pollMap();
                }, repollSeconds * 1000);

                this.mapPollMutex.leave();
            });
        });
    }


    async shutdown() {
        for (const capability of Object.values(this.capabilities)) {
            if (capability instanceof ValetudoBasedCapability) {
                await capability.shutdown();
            }
        }
    }

    getManufacturer() {
        return "Valetudo";
    }

    getModelName() {
        return "ValetudoRobot";
    }

    /**
     * @typedef {object} ModelDetails
     * @property {Array<import("../entities/state/attributes/AttachmentStateAttribute").AttachmentStateAttributeType>} supportedAttachments
     * @property {Array<import("../entities/state/attributes/DockComponentStateAttribute").DockComponentStateAttributeType>} supportedDockComponents
     */

    /**
     * This method may be overridden to return model-specific details
     * such as which types of attachments to expect in the state
     *
     * @returns {ModelDetails}
     */
    getModelDetails() {
        return {
            supportedAttachments: [],
            supportedDockComponents: []
        };
    }

    /**
     * This method may be overridden to return robot-specific well-known properties
     * such as the firmware version
     *
     * @returns {object}
     */
    getProperties() {
        return {};
    }

    /**
     * Basically used to log some more robot-specific information
     */
    startup() {
        //intentional
    }

    /**
     * @protected
     */
    emitStateUpdated() {
        this.eventEmitter.emit(ValetudoRobot.EVENTS.StateUpdated);
    }

    /**
     * @public
     * @param {() => void} listener
     */
    onStateUpdated(listener) {
        this.eventEmitter.on(ValetudoRobot.EVENTS.StateUpdated, listener);
    }

    /**
     * @protected
     */
    emitStateAttributesUpdated() {
        this.emitStateUpdated();

        this.eventEmitter.emit(ValetudoRobot.EVENTS.StateAttributesUpdated);
    }

    /**
     * @public
     * @param {() => void} listener
     */
    onStateAttributesUpdated(listener) {
        this.eventEmitter.on(ValetudoRobot.EVENTS.StateAttributesUpdated, listener);
    }

    /**
     * @protected
     */
    emitMapUpdated() {
        MapFloorNoiseFilter.FILTER(this.state.map);
        this.emitStateUpdated();

        this.eventEmitter.emit(ValetudoRobot.EVENTS.MapUpdated);
    }

    /**
     * @public
     * @param {() => void} listener
     */
    onMapUpdated(listener) {
        this.eventEmitter.on(ValetudoRobot.EVENTS.MapUpdated, listener);
    }

    /**
     *
     * This very badly named function is used for the implementation autodetection feature
     *
     * Returns true if the implementation thinks that it's the right one for this particular robot
     */
    static IMPLEMENTATION_AUTO_DETECTION_HANDLER() {
        return false;
    }
}

ValetudoRobot.EVENTS = {
    StateUpdated: "StateUpdated",
    StateAttributesUpdated: "StateAttributesUpdated",
    MapUpdated: "MapUpdated"
};

ValetudoRobot.DEFAULT_MAP = require("../res/default_map");

ValetudoRobot.WELL_KNOWN_PROPERTIES = {
    FIRMWARE_VERSION: "firmwareVersion"
};

ValetudoRobot.MAP_POLLING_INTERVALS = Object.freeze({
    DEFAULT: 60,
    ACTIVE: 2,
    ERROR: 30
});


const HUGE_MAP_THRESHOLD = 145 * 10_000; //145m² in cm²

module.exports = ValetudoRobot;

const Capability = require("./Capability");
const NotImplementedError = require("../NotImplementedError");

/**
 * Settings the robot keeps for each segment: in which order segments are cleaned, and how each one is cleaned
 * when the robot uses its per-segment settings (e.g. a "personalized" operation mode).
 *
 * @template {import("../ValetudoRobot")} T
 * @extends Capability<T>
 */
class MapSegmentCleaningSettingsCapability extends Capability {
    /**
     * @returns {Promise<MapSegmentCleaningSettings>}
     */
    async getSettings() {
        throw new NotImplementedError();
    }

    /**
     * Segments that aren't listed keep their settings
     *
     * @param {MapSegmentCleaningSettings} settings
     * @returns {Promise<void>}
     */
    async setSettings(settings) {
        throw new NotImplementedError();
    }

    /**
     * @returns {MapSegmentCleaningSettingsCapabilityProperties}
     */
    getProperties() {
        return {
            iterationCount: {
                min: 1,
                max: 1
            },
            operationModes: [],
            fanSpeeds: [],
            waterGrades: [],
            cleanRoutes: []
        };
    }

    getType() {
        return MapSegmentCleaningSettingsCapability.TYPE;
    }
}

MapSegmentCleaningSettingsCapability.TYPE = "MapSegmentCleaningSettingsCapability";

module.exports = MapSegmentCleaningSettingsCapability;

/**
 * @typedef {object} MapSegmentCleaningSettings
 *
 * @property {Array<string>} order the ids of the segments to clean in this order. All others are left to the robot
 * @property {Array<MapSegmentCleaningSettingsEntry>} segments
 */

/**
 * @typedef {object} MapSegmentCleaningSettingsEntry
 *
 * @property {string} id
 * @property {number} iterations
 * @property {string} operationMode
 * @property {string} fanSpeed
 * @property {string} waterGrade
 * @property {string} cleanRoute
 */

/**
 * @typedef {object} MapSegmentCleaningSettingsCapabilityProperties
 *
 * @property {{min: number, max: number}} iterationCount
 * @property {Array<string>} operationModes
 * @property {Array<string>} fanSpeeds
 * @property {Array<string>} waterGrades
 * @property {Array<string>} cleanRoutes
 */

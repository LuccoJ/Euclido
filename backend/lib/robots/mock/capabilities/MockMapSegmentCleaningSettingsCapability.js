const MapSegmentCleaningSettingsCapability = require("../../../core/capabilities/MapSegmentCleaningSettingsCapability");

/**
 * @extends MapSegmentCleaningSettingsCapability<import("../MockValetudoRobot")>
 */
class MockMapSegmentCleaningSettingsCapability extends MapSegmentCleaningSettingsCapability {
    /**
     * @param {object} options
     * @param {import("../MockValetudoRobot")} options.robot
     */
    constructor(options) {
        super(options);

        this.settings = {
            order: ["2", "1"],
            segments: ["1", "2", "3", "4"].map(id => {
                return {
                    id: id,
                    iterations: 1,
                    operationMode: "vacuum",
                    fanSpeed: "medium",
                    waterGrade: id === "4" ? "raw_2" : "low",
                    cleanRoute: "normal"
                };
            })
        };
    }

    async getSettings() {
        return structuredClone(this.settings);
    }

    async setSettings(settings) {
        const segments = this.settings.segments.map(segment => {
            return settings.segments.find(s => {
                return s.id === segment.id;
            }) ?? segment;
        });

        this.settings = {order: settings.order, segments: segments};
    }

    getProperties() {
        return {
            iterationCount: {
                min: 1,
                max: 3
            },
            operationModes: ["vacuum_and_mop", "vacuum", "mop"],
            fanSpeeds: ["min", "low", "medium", "high"],
            waterGrades: ["min", "low", "medium", "high", "max"],
            cleanRoutes: ["quick", "normal", "deep"]
        };
    }
}

module.exports = MockMapSegmentCleaningSettingsCapability;

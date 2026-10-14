const fs = require("node:fs");
const Logger = require("../../Logger");

/**
 * Data Valetudo has to remember about the robot because the robot doesn't report it back.
 *
 * It lives in valetudo_config.json under robot.implementationSpecificConfig, which the configuration schema leaves
 * free-form, so it survives being loaded by a Valetudo build that doesn't know about it.
 */
class MideaPersistentStore {
    /**
     * @param {object} options
     * @param {import("../../Configuration")} options.config
     * @param {string} options.key
     * @param {string} [options.legacyFilePath] a file this data used to be stored in, imported and deleted once
     */
    constructor(options) {
        this.config = options.config;
        this.key = options.key;

        if (options.legacyFilePath && this.get() === undefined) {
            this.importLegacyFile(options.legacyFilePath);
        }
    }

    /**
     * @returns {any}
     */
    get() {
        return this.config.get("robot")?.implementationSpecificConfig?.[this.key];
    }

    /**
     * @param {any} value
     */
    set(value) {
        const robotConfig = this.config.get("robot");

        this.config.set("robot", Object.assign({}, robotConfig, {
            implementationSpecificConfig: Object.assign({}, robotConfig.implementationSpecificConfig, {
                [this.key]: value
            })
        }));
    }

    /**
     * @private
     * @param {string} filePath
     */
    importLegacyFile(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                this.set(JSON.parse(fs.readFileSync(filePath).toString()));
                fs.unlinkSync(filePath);

                Logger.info(`Moved ${filePath} into the configuration file`);
            }
        } catch (e) {
            Logger.warn(`Could not import ${filePath}`, e);
        }
    }
}

module.exports = MideaPersistentStore;

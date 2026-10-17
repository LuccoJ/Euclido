const CapabilityRouter = require("./CapabilityRouter");

class MapSegmentCleaningSettingsCapabilityRouter extends CapabilityRouter {
    initRoutes() {
        this.router.get("/", async (req, res) => {
            try {
                res.json(await this.capability.getSettings());
            } catch (e) {
                this.sendErrorResponse(req, res, e);
            }
        });

        this.router.put("/", this.validator, async (req, res) => {
            if (Array.isArray(req.body.order) && Array.isArray(req.body.segments)) {
                try {
                    await this.capability.setSettings({
                        order: req.body.order,
                        segments: req.body.segments
                    });

                    res.sendStatus(200);
                } catch (e) {
                    this.sendErrorResponse(req, res, e);
                }
            } else {
                res.sendStatus(400);
            }
        });
    }
}

module.exports = MapSegmentCleaningSettingsCapabilityRouter;

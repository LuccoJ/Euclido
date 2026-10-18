const CapabilityRouter = require("./CapabilityRouter");

class EmergencyLightControlCapabilityRouter extends CapabilityRouter {
    initRoutes() {
        this.router.get("/", async (req, res) => {
            try {
                res.json({
                    level: await this.capability.getLevel()
                });
            } catch (e) {
                this.sendErrorResponse(req, res, e);
            }
        });

        this.router.put("/", this.validator, async (req, res) => {
            if (req.body.action === "set_level" && typeof req.body.value === "number") {
                try {
                    await this.capability.setLevel(req.body.value);

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

module.exports = EmergencyLightControlCapabilityRouter;

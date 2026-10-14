import React from "react";
import {Button, Grid2, Paper, Typography} from "@mui/material";
import {Tune as SegmentCleaningSettingsIcon} from "@mui/icons-material";
import {useNavigate} from "react-router-dom";
import {
    Capability,
    capabilityToPresetType,
    RobotAttributeClass,
    useRobotAttributeQuery
} from "../api";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";

/**
 * In the personalized operation mode, the robot uses the per-room settings, so offer a way there
 */
const PersonalizedRoomSettingsLink = (): React.ReactElement | null => {
    const [settingsSupported] = useCapabilitiesSupported(Capability.MapSegmentCleaningSettings);
    const navigate = useNavigate();
    const {data: operationMode} = useRobotAttributeQuery(
        RobotAttributeClass.PresetSelectionState,
        (attributes) => {
            return attributes.filter((attribute) => {
                return attribute.type === capabilityToPresetType[Capability.OperationModeControl];
            })[0];
        }
    );

    if (!settingsSupported || (operationMode?.value as string) !== "personalized") {
        return null;
    }

    return (
        <Grid2>
            <Paper>
                <Grid2 container alignItems="center" spacing={1} sx={{padding: "0.5rem 1rem"}}>
                    <Grid2 sx={{flexGrow: 1}}>
                        <Typography variant="body2">
                            Each room is cleaned with its own settings.
                        </Typography>
                    </Grid2>
                    <Grid2>
                        <Button
                            size="small"
                            startIcon={<SegmentCleaningSettingsIcon/>}
                            onClick={() => {
                                navigate("/options/map_management/segment_cleaning_settings");
                            }}
                        >
                            Room settings
                        </Button>
                    </Grid2>
                </Grid2>
            </Paper>
        </Grid2>
    );
};

export default PersonalizedRoomSettingsLink;

import {
    Capability,
    capabilityToPresetType,
    RobotAttributeClass,
    useCleanSegmentsMutation,
    useMapSegmentationPropertiesQuery,
    useRobotAttributeQuery,
    useRobotStatusQuery
} from "../../../api";
import React from "react";
import {Box, Button, CircularProgress, Container, Grid2, Typography} from "@mui/material";
import {ActionButton} from "../../Styled";
import IntegrationHelpDialog from "../../../components/IntegrationHelpDialog";
import {useLongPress} from "use-long-press";
import {IterationsIcon} from "../../../assets/icon_components/IterationsIcon";
import {
    Clear as ClearIcon,
    PlayArrow as GoIcon,
    Tune as RoomSettingsIcon
} from "@mui/icons-material";
import {useNavigate} from "react-router-dom";

interface SegmentActionsProperties {
    segments: string[];

    onClear(): void;
}

const SegmentActions = (
    props: SegmentActionsProperties
): React.ReactElement => {
    const {segments, onClear} = props;
    const [iterationCount, setIterationCount] = React.useState(1);
    const navigate = useNavigate();
    const [integrationHelpDialogOpen, setIntegrationHelpDialogOpen] = React.useState(false);
    const [integrationHelpDialogPayload, setIntegrationHelpDialogPayload] = React.useState("");


    const {
        data: mapSegmentationProperties,
        isPending: mapSegmentationPropertiesPending,
        isError: mapSegmentationPropertiesLoadError,
        refetch: refetchMapSegmentationProperties,
    } = useMapSegmentationPropertiesQuery();
    const {data: status} = useRobotStatusQuery((state) => {
        return state.value;
    });
    // In the personalized operation mode, every room is cleaned as often as its own settings say
    const {data: personalized} = useRobotAttributeQuery(RobotAttributeClass.PresetSelectionState, (attributes) => {
        return attributes.some((attribute) => {
            return attribute.type === capabilityToPresetType[Capability.OperationModeControl] &&
                (attribute.value as string) === "personalized";
        });
    });
    const {
        mutate: executeSegmentAction,
        isPending: segmentActionExecuting
    } = useCleanSegmentsMutation({
        onSuccess: onClear,
    });

    const canClean = status === "idle" || status === "docked" || status === "paused" || status === "returning" || status === "error";
    const didSelectSegments = segments.length > 0;

    const handleClick = React.useCallback(() => {
        if (!didSelectSegments || !canClean) {
            return;
        }

        executeSegmentAction({
            segment_ids: segments,
            iterations: personalized ? 1 : iterationCount,
            customOrder: mapSegmentationProperties?.customOrderSupport
        });
    }, [canClean, didSelectSegments, executeSegmentAction, segments, iterationCount, personalized, mapSegmentationProperties]);

    const handleLongClick = React.useCallback(() => {
        setIntegrationHelpDialogPayload(JSON.stringify({
            action: "start_segment_action",
            segment_ids: segments,
            iterations: personalized ? 1 : (iterationCount ?? 1),
            customOrder: mapSegmentationProperties?.customOrderSupport ?? false
        }, null, 2));

        setIntegrationHelpDialogOpen(true);
    }, [segments, iterationCount, personalized, mapSegmentationProperties]);

    const setupClickHandlers = useLongPress(
        handleLongClick,
        {
            onCancel: (event) => {
                handleClick();
            },
            threshold: 500,
            captureEvent: true,
            cancelOnMovement: true,
        }
    );

    const handleIterationToggle = React.useCallback(() => {
        if (mapSegmentationProperties) {
            setIterationCount(iterationCount % mapSegmentationProperties.iterationCount.max + 1);
        }
    }, [iterationCount, setIterationCount, mapSegmentationProperties]);

    if (mapSegmentationPropertiesLoadError) {
        return (
            <Container>
                <Typography color="error">
                    Error loading {Capability.MapSegmentation} properties
                </Typography>
                <Box m={1}/>
                <Button color="primary" variant="contained" onClick={() => {
                    return refetchMapSegmentationProperties();
                }}>
                    Retry
                </Button>
            </Container>
        );
    }

    if (mapSegmentationProperties === undefined && mapSegmentationPropertiesPending) {
        return (
            <Container>
                <CircularProgress/>
            </Container>
        );
    }

    if (mapSegmentationProperties === undefined) {
        return (
            <Container>
                <Typography align="center">
                    No {Capability.MapSegmentation} properties
                </Typography>
                ;
            </Container>
        );
    }



    return (
        <>
            <Grid2 container spacing={1} direction="row-reverse" flexWrap="wrap-reverse">
                <Grid2>
                    <ActionButton
                        disabled={!didSelectSegments || segmentActionExecuting || !canClean}
                        color="inherit"
                        size="medium"
                        variant="extended"
                        {...setupClickHandlers()}
                    >
                        <GoIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Clean {segments.length} segments
                        {segmentActionExecuting && (
                            <CircularProgress
                                color="inherit"
                                size={18}
                                style={{marginLeft: 10}}
                            />
                        )}
                    </ActionButton>
                </Grid2>
                {
                    personalized &&
                    <Grid2>
                        <ActionButton
                            color="inherit"
                            size="medium"
                            variant="extended"
                            style={{
                                textTransform: "initial"
                            }}
                            onClick={() => {
                                navigate("/robot/room_settings");
                            }}
                            title="Each room is cleaned with its own settings"
                        >
                            <RoomSettingsIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                            Room settings
                        </ActionButton>
                    </Grid2>
                }
                {
                    mapSegmentationProperties.iterationCount.max > 1 && !personalized &&
                    <Grid2>
                        <ActionButton
                            color="inherit"
                            size="medium"
                            variant="extended"
                            style={{
                                textTransform: "initial"
                            }}
                            onClick={handleIterationToggle}
                            title="Iteration Count"
                        >
                            <IterationsIcon iterationCount={iterationCount}/>
                        </ActionButton>
                    </Grid2>
                }
                {
                    didSelectSegments &&
                    <Grid2>
                        <ActionButton
                            color="inherit"
                            size="medium"
                            variant="extended"
                            onClick={onClear}
                        >
                            <ClearIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                            Clear
                        </ActionButton>
                    </Grid2>
                }
                {
                    (didSelectSegments && !canClean) &&
                    <Grid2>
                        <Typography variant="caption" color="textSecondary">
                            Cannot start segment cleaning while the robot is busy
                        </Typography>
                    </Grid2>
                }
            </Grid2>
            <IntegrationHelpDialog
                dialogOpen={integrationHelpDialogOpen}
                setDialogOpen={(open: boolean) => {
                    setIntegrationHelpDialogOpen(open);
                }}
                coordinatesWarning={false}
                helperText={"To start a cleanup of the currently selected segments with the currently configured parameters via MQTT or REST, simply use this payload."}
                payload={integrationHelpDialogPayload}
            />
        </>
    );
};

export default SegmentActions;

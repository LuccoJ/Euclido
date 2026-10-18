import {Box, Grid2, Icon, Paper, styled, Typography} from "@mui/material";
import ControlsBody from "./ControlsBody";
import {
    AppRegistration as OperationModeIcon,
    ExpandLess as OpenIcon,
    ExpandMore as CloseIcon,
} from "@mui/icons-material";
import React from "react";
import {PresetSelectionState, RobotAttributeClass, useRobotAttributeQuery, useRobotStatusQuery} from "../api";
import {FanSpeedMediumIcon, WaterGradeLowIcon} from "../components/CustomIcons";
import {presetFriendlyNames} from "../presetUtils";

const capitalize = (value: string): string => {
    return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
};

/**
 * What the collapsed controls show: the robot's state and its current mode, fan speed and water usage.
 * Only a reminder, tapping it opens the controls to change them
 */
const ControlsSummary = (): React.ReactElement => {
    const {data: status} = useRobotStatusQuery();
    const {data: presets} = useRobotAttributeQuery(RobotAttributeClass.PresetSelectionState);
    const preset = (type: PresetSelectionState["type"]): string | undefined => {
        const value = presets?.find(p => {
            return p.type === type;
        })?.value;

        return value !== undefined ? (presetFriendlyNames[value] ?? capitalize(value)) : undefined;
    };

    const items: Array<[React.ReactElement, string | undefined]> = [
        [<OperationModeIcon key="mode" fontSize="small"/>, preset("operation_mode")],
        [<FanSpeedMediumIcon key="fan" fontSize="small"/>, preset("fan_speed")],
        [<WaterGradeLowIcon key="water" fontSize="small"/>, preset("water_grade")],
    ];

    return (
        <Box sx={{display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", minWidth: 0}}>
            <Typography variant="caption" color="text.secondary" noWrap>
                {status ? capitalize(status.value) + (status.flag !== "none" ? ` (${capitalize(status.flag)})` : "") : ""}
            </Typography>
            <Box sx={{display: "flex", alignItems: "center", columnGap: "0.75rem", minWidth: 0}}>
                {
                    items.filter(([, value]) => {
                        return value !== undefined;
                    }).map(([icon, value]) => {
                        return (
                            <Box key={icon.key} sx={{display: "flex", alignItems: "center", gap: "0.25rem", minWidth: 0}}>
                                {icon}
                                <Typography variant="body2" noWrap>{value}</Typography>
                            </Box>
                        );
                    })
                }
            </Box>
        </Box>
    );
};

const MobileControls: React.FunctionComponent<{ open: boolean, setOpen: (newOpen: boolean) => void }> = ({
    open,
    setOpen
}): React.ReactElement => {
    const StyledIcon = styled(Icon)(({theme}) => {
        return {
            fontSize: "2.5em"
        };
    });
    const ControlsSheetContainer = styled(Box)(({ theme }) => {
        const color = theme.palette.mode === "light" ? "#ededed" : "#242424";

        return {
            backgroundColor: color,
            borderColor: color,
            borderTopWidth: "4px",
            borderLeftWidth: "1px",
            borderRightWidth: "1px",
            borderBottomWidth: "1px",
            borderStyle: "solid",
            borderTopLeftRadius: "4px",
            borderTopRightRadius: "4px",
            paddingTop: "0.125rem",
        };
    });


    return (
        <Paper sx={{
            height: "100%"
        }}>
            <ControlsSheetContainer
                style={{
                    display: open ? "" : "none",
                    height: "calc(95% - 68px)",
                }}
            >
                <Box p={1} sx={{
                    overflow: open ? "scroll" : "hidden",
                    height: "100%",
                }}>
                    <ControlsBody />
                </Box>
            </ControlsSheetContainer>
            <Grid2
                container
                direction="row"
                sx={{
                    height: "68px"
                }}
                onClick={() => {
                    setOpen(!open);
                }}
            >
                <Grid2 sx={{flex: 1, minWidth: 0}}>
                    <Box px={2} py={1} sx={{height: "100%", boxSizing: "border-box"}}>
                        <ControlsSummary/>
                    </Box>
                </Grid2>
                <Grid2 sx={{
                    marginLeft: "auto"
                }}>
                    <Box px={2} pt={2} pb={1}>
                        <StyledIcon as={open ? CloseIcon : OpenIcon}/>
                    </Box>
                </Grid2>
            </Grid2>
        </Paper>
    );
};

export default MobileControls;

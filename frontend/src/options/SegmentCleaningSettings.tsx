import React from "react";
import {
    Box,
    Chip,
    Grid2,
    IconButton,
    MenuItem,
    Paper,
    Select,
    Switch,
    Typography
} from "@mui/material";
import {
    AppRegistration as OperationModeIcon,
    ArrowDownward as MoveDownIcon,
    ArrowUpward as MoveUpIcon,
    Repeat as PassesIcon,
    Route as RouteIcon,
    Tune as SegmentCleaningSettingsIcon
} from "@mui/icons-material";
import {
    MapSegmentCleaningSettings,
    MapSegmentCleaningSettingsEntry,
    MapSegmentCleaningSettingsProperties,
    PresetValue,
    RawMapLayerType,
    sendMapSegmentCleaningSettingsOnLeave,
    useMapSegmentCleaningSettingsMutation,
    useMapSegmentCleaningSettingsPropertiesQuery,
    useMapSegmentCleaningSettingsQuery,
    useRobotMapQuery
} from "../api";
import PaperContainer from "../components/PaperContainer";
import DetailPageHeaderRow from "../components/DetailPageHeaderRow";
import {presetFriendlyNames} from "../presetUtils";
import {FanSpeedMediumIcon, WaterGradeLowIcon} from "../components/CustomIcons";
import {SegmentCleaningSettingsHelp} from "./res/SegmentCleaningSettingsHelp";

const routeFriendlyNames: Record<string, string> = {
    "quick": "Quick",
    "normal": "Standard",
    "intensive": "Intensive",
    "deep": "Deep"
};

const AUTOSAVE_DELAY = 1000; // ms

// "Vacuum & Mop" gets cut off to look like "Vacuum" in the narrow column. Next to Vacuum and Mop in the list, Both is clear
const operationModeFriendlyNames: Record<string, string> = {
    ...(presetFriendlyNames as Record<PresetValue, string>),
    "vacuum_and_mop": "Both"
};

const getLabel = (value: string, friendlyNames: Record<string, string>): string => {
    const raw = /^raw_(\d+)$/.exec(value);
    if (raw) {
        // A value the robot set itself, outside of the scale offered here
        return "Default";
    }

    return friendlyNames[value] ?? value;
};

const SettingSelect = (props: {
    label: string,
    icon: React.ReactElement,
    value: string,
    options: Array<string>,
    friendlyNames: Record<string, string>,
    gridColumn?: {xs: string, sm: string},
    onChange: (value: string) => void
}): React.ReactElement => {
    // A value the robot has stored that isn't one of the known options can be kept, but not chosen again
    const options = props.options.includes(props.value) ? props.options : [props.value, ...props.options];

    return (
        <Box
            sx={{display: "flex", alignItems: "center", gap: "0.25rem", minWidth: 0, gridColumn: props.gridColumn}}
            title={props.label}
        >
            {props.icon}
            <Select
                variant="standard"
                disableUnderline
                size="small"
                value={props.value}
                inputProps={{"aria-label": props.label}}
                sx={{fontSize: "0.875rem", flex: 1, minWidth: 0}}
                onChange={(e) => {
                    props.onChange(e.target.value);
                }}
            >
                {
                    options.map(option => {
                        return (
                            <MenuItem key={option} value={option}>
                                {getLabel(option, props.friendlyNames)}
                            </MenuItem>
                        );
                    })
                }
            </Select>
        </Box>
    );
};

const SegmentCard = (props: {
    name: string,
    entry: MapSegmentCleaningSettingsEntry,
    position: number | undefined,
    orderLength: number,
    properties: MapSegmentCleaningSettingsProperties,
    onChange: (entry: MapSegmentCleaningSettingsEntry) => void,
    onMove: (delta: number) => void,
    onOrderedChange: (ordered: boolean) => void
}): React.ReactElement => {
    const {entry, position, properties} = props;
    const iterationOptions = [];
    for (let i = properties.iterationCount.min; i <= properties.iterationCount.max; i++) {
        iterationOptions.push(`${i}`);
    }

    return (
        <Paper sx={{boxShadow: 3, padding: "0.5rem 1rem"}}>
            {/* On wide screens, one line per room. Otherwise the room and its place in the order come first and the
                settings below them. The settings have fixed columns, so they line up from one room to the next */}
            <Box
                sx={{
                    display: "flex",
                    flexDirection: {xs: "column", md: "row"},
                    alignItems: {xs: "stretch", md: "center"},
                    columnGap: "1.5rem",
                    rowGap: "0.25rem"
                }}
            >
                <Box sx={{display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0}}>
                    <Chip
                        label={position !== undefined ? position + 1 : "–"}
                        color={position !== undefined ? "primary" : "default"}
                        size="small"
                    />
                    <Typography noWrap sx={{flex: 1, minWidth: 0}} title={props.name}>{props.name}</Typography>
                    <Box sx={{display: "flex", alignItems: "center", flexShrink: 0}}>
                        <IconButton
                            size="small"
                            disabled={position === undefined || position === 0}
                            onClick={() => {
                                props.onMove(-1);
                            }}
                            title="Clean earlier"
                        >
                            <MoveUpIcon fontSize="small"/>
                        </IconButton>
                        <IconButton
                            size="small"
                            disabled={position === undefined || position === props.orderLength - 1}
                            onClick={() => {
                                props.onMove(1);
                            }}
                            title="Clean later"
                        >
                            <MoveDownIcon fontSize="small"/>
                        </IconButton>
                        <Switch
                            size="small"
                            checked={position !== undefined}
                            onChange={(e) => {
                                props.onOrderedChange(e.target.checked);
                            }}
                            inputProps={{"aria-label": "In order"}}
                            title="In order"
                        />
                        <Typography
                            variant="body2"
                            sx={{display: {xs: "none", sm: "block"}, whiteSpace: "nowrap"}}
                        >
                            In order
                        </Typography>
                    </Box>
                </Box>
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: {
                            // Passes on its own narrow column, water and route below mode and fan
                            xs: "3.5rem repeat(2, minmax(0, 1fr))",
                            sm: "3.5rem repeat(4, minmax(0, 1fr))",
                            md: "3.5rem 7rem 6.5rem 6.5rem 7.5rem"
                        },
                        columnGap: "1rem",
                        rowGap: "0.25rem",
                        flexShrink: 0
                    }}
                >
                    <SettingSelect
                        label="Passes"
                        icon={<PassesIcon fontSize="small"/>}
                        value={`${entry.iterations}`}
                        options={iterationOptions}
                        friendlyNames={{}}
                        onChange={(value) => {
                            props.onChange({...entry, iterations: parseInt(value)});
                        }}
                    />
                    <SettingSelect
                        label="Mode"
                        icon={<OperationModeIcon fontSize="small"/>}
                        value={entry.operationMode}
                        options={properties.operationModes}
                        friendlyNames={operationModeFriendlyNames}
                        onChange={(value) => {
                            props.onChange({...entry, operationMode: value});
                        }}
                    />
                    <SettingSelect
                        label="Fan speed"
                        icon={<FanSpeedMediumIcon fontSize="small"/>}
                        value={entry.fanSpeed}
                        options={properties.fanSpeeds}
                        friendlyNames={presetFriendlyNames as Record<PresetValue, string>}
                        onChange={(value) => {
                            props.onChange({...entry, fanSpeed: value});
                        }}
                    />
                    <SettingSelect
                        label="Water usage"
                        icon={<WaterGradeLowIcon fontSize="small"/>}
                        value={entry.waterGrade}
                        gridColumn={{xs: "2", sm: "auto"}}
                        options={properties.waterGrades}
                        friendlyNames={presetFriendlyNames as Record<PresetValue, string>}
                        onChange={(value) => {
                            props.onChange({...entry, waterGrade: value});
                        }}
                    />
                    <SettingSelect
                        label="Route"
                        icon={<RouteIcon fontSize="small"/>}
                        value={entry.cleanRoute}
                        gridColumn={{xs: "3", sm: "auto"}}
                        options={properties.cleanRoutes}
                        friendlyNames={routeFriendlyNames}
                        onChange={(value) => {
                            props.onChange({...entry, cleanRoute: value});
                        }}
                    />
                </Box>
            </Box>
        </Paper>
    );
};

const SegmentCleaningSettings = (): React.ReactElement => {
    const {
        data: settings,
        isPending: settingsPending,
        isFetching: settingsFetching,
        isError: settingsError,
        refetch: refetchSettings
    } = useMapSegmentCleaningSettingsQuery();
    const {data: properties} = useMapSegmentCleaningSettingsPropertiesQuery();
    const {data: map} = useRobotMapQuery();
    const {mutate: saveSettings, isPending: saving} = useMapSegmentCleaningSettingsMutation();

    const [order, setOrder] = React.useState<Array<string>>([]);
    const [entries, setEntries] = React.useState<Record<string, MapSegmentCleaningSettingsEntry>>({});
    const [modified, setModified] = React.useState(false);
    // Changes are saved on their own a moment after the last one. Each change bumps the version, so a save that
    // finishes while newer changes are waiting doesn't mark them as saved
    const [version, setVersion] = React.useState(0);
    const latestVersion = React.useRef(0);
    const savedVersion = React.useRef(0);

    const markChanged = React.useCallback(() => {
        latestVersion.current++;
        setVersion(latestVersion.current);
        setModified(true);
    }, []);

    React.useEffect(() => {
        if (settings && !modified) {
            setOrder(settings.order);
            setEntries(Object.fromEntries(settings.segments.map(entry => {
                return [entry.id, entry];
            })));
        }
    }, [settings, modified]);

    const names = React.useMemo(() => {
        const result: Record<string, string> = {};

        for (const layer of map?.layers ?? []) {
            if (layer.type === RawMapLayerType.Segment && layer.metaData.segmentId !== undefined) {
                result[layer.metaData.segmentId] = layer.metaData.name ?? `Segment ${layer.metaData.segmentId}`;
            }
        }

        return result;
    }, [map]);

    const getName = React.useCallback((id: string) => {
        return names[id] ?? `Segment ${id}`;
    }, [names]);

    // Rooms in the order first, then the others by name
    const sortedIds = React.useMemo(() => {
        const unordered = Object.keys(entries).filter(id => {
            return !order.includes(id);
        }).sort((a, b) => {
            return getName(a).localeCompare(getName(b));
        });

        return [...order.filter(id => {
            return entries[id] !== undefined;
        }), ...unordered];
    }, [entries, order, getName]);

    React.useEffect(() => {
        if (!modified || saving || version === savedVersion.current) {
            return;
        }

        const timeout = setTimeout(() => {
            const versionBeingSaved = version;

            saveSettings(
                {
                    order: order,
                    segments: Object.values(entries)
                },
                {
                    onSettled: () => {
                        savedVersion.current = versionBeingSaved;

                        // Newer changes get their own save once this one is done
                        if (latestVersion.current === versionBeingSaved) {
                            setModified(false);
                        }
                    }
                }
            );
        }, AUTOSAVE_DELAY);

        return () => {
            clearTimeout(timeout);
        };
    }, [modified, saving, version, order, entries, saveSettings]);

    // Leaving the page (or closing it) before the last change got saved saves it right away
    const unsavedSettings = React.useRef<MapSegmentCleaningSettings | null>(null);
    React.useEffect(() => {
        unsavedSettings.current = modified ? {order: order, segments: Object.values(entries)} : null;
    }, [modified, order, entries]);

    React.useEffect(() => {
        const saveNow = () => {
            if (unsavedSettings.current !== null && latestVersion.current !== savedVersion.current) {
                sendMapSegmentCleaningSettingsOnLeave(unsavedSettings.current);
                savedVersion.current = latestVersion.current;
            }
        };
        window.addEventListener("pagehide", saveNow);

        return () => {
            window.removeEventListener("pagehide", saveNow);
            saveNow();
        };
    }, []);

    const content = React.useMemo(() => {
        if (settingsError) {
            return (
                <Typography color="error" style={{textAlign: "center"}}>
                    Error loading the personalized room cleaning settings.
                </Typography>
            );
        }

        if (settingsPending || !properties) {
            return null;
        }

        return sortedIds.map(id => {
            const position = order.indexOf(id);

            return (
                <Grid2 key={id} sx={{paddingBottom: "1rem"}}>
                    <SegmentCard
                        name={getName(id)}
                        entry={entries[id]}
                        position={position === -1 ? undefined : position}
                        orderLength={order.length}
                        properties={properties}
                        onChange={(entry) => {
                            setEntries({...entries, [id]: entry});
                            markChanged();
                        }}
                        onMove={(delta) => {
                            const newOrder = [...order];
                            newOrder.splice(position, 1);
                            newOrder.splice(position + delta, 0, id);

                            setOrder(newOrder);
                            markChanged();
                        }}
                        onOrderedChange={(ordered) => {
                            setOrder(ordered ? [...order, id] : order.filter(o => {
                                return o !== id;
                            }));
                            markChanged();
                        }}
                    />
                </Grid2>
            );
        });
    }, [settingsError, settingsPending, properties, sortedIds, order, entries, getName, markChanged]);

    return (
        <PaperContainer>
            <Grid2 container direction="row">
                <Box style={{width: "100%"}}>
                    <DetailPageHeaderRow
                        title="Personalized room cleaning settings"
                        icon={<SegmentCleaningSettingsIcon/>}
                        helpText={SegmentCleaningSettingsHelp}
                        onRefreshClick={() => {
                            savedVersion.current = latestVersion.current;
                            setModified(false);
                            refetchSettings().catch(() => {
                                /* intentional */
                            });
                        }}
                        isRefreshing={settingsFetching}
                    />

                    <Typography variant="body2" sx={{marginTop: "1rem", marginBottom: "1rem"}}>
                        The order applies to every cleanup of several rooms. The other settings only apply in the
                        Personalized operation mode. Changes are saved automatically.
                    </Typography>

                    <Grid2 container direction="column">
                        {content}
                    </Grid2>

                </Box>
            </Grid2>
        </PaperContainer>
    );
};

export default SegmentCleaningSettings;

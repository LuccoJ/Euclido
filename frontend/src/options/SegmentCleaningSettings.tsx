import React from "react";
import {
    Box,
    Button,
    Chip,
    FormControl,
    FormControlLabel,
    Grid2,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Switch,
    Typography
} from "@mui/material";
import {
    ArrowDownward as MoveDownIcon,
    ArrowUpward as MoveUpIcon,
    Tune as SegmentCleaningSettingsIcon
} from "@mui/icons-material";
import {
    MapSegmentCleaningSettingsEntry,
    MapSegmentCleaningSettingsProperties,
    PresetValue,
    RawMapLayerType,
    useMapSegmentCleaningSettingsMutation,
    useMapSegmentCleaningSettingsPropertiesQuery,
    useMapSegmentCleaningSettingsQuery,
    useRobotMapQuery
} from "../api";
import PaperContainer from "../components/PaperContainer";
import DetailPageHeaderRow from "../components/DetailPageHeaderRow";
import {presetFriendlyNames} from "../presetUtils";
import {SegmentCleaningSettingsHelp} from "./res/SegmentCleaningSettingsHelp";

const routeFriendlyNames: Record<string, string> = {
    "quick": "Quick",
    "normal": "Standard",
    "intensive": "Intensive",
    "deep": "Deep"
};

const getLabel = (value: string, friendlyNames: Record<string, string>): string => {
    const raw = /^raw_(\d+)$/.exec(value);
    if (raw) {
        return `Robot's own value (${raw[1]})`;
    }

    return friendlyNames[value] ?? value;
};

const SettingSelect = (props: {
    label: string,
    value: string,
    options: Array<string>,
    friendlyNames: Record<string, string>,
    onChange: (value: string) => void
}): React.ReactElement => {
    // A value the robot has stored that isn't one of the known options can be kept, but not chosen again
    const options = props.options.includes(props.value) ? props.options : [props.value, ...props.options];

    return (
        <FormControl variant="standard" sx={{minWidth: "8rem"}}>
            <InputLabel>{props.label}</InputLabel>
            <Select
                value={props.value}
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
        </FormControl>
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
        <Paper sx={{boxShadow: 3, padding: "1rem"}}>
            <Grid2 container alignItems="center" spacing={1}>
                <Grid2>
                    <Chip
                        label={position !== undefined ? position + 1 : "–"}
                        color={position !== undefined ? "primary" : "default"}
                        size="small"
                    />
                </Grid2>
                <Grid2 sx={{flexGrow: 1}}>
                    <Typography>{props.name}</Typography>
                </Grid2>
                <Grid2>
                    <IconButton
                        size="small"
                        disabled={position === undefined || position === 0}
                        onClick={() => {
                            props.onMove(-1);
                        }}
                        title="Clean earlier"
                    >
                        <MoveUpIcon/>
                    </IconButton>
                    <IconButton
                        size="small"
                        disabled={position === undefined || position === props.orderLength - 1}
                        onClick={() => {
                            props.onMove(1);
                        }}
                        title="Clean later"
                    >
                        <MoveDownIcon/>
                    </IconButton>
                    <FormControlLabel
                        sx={{marginLeft: "0.5rem", marginRight: 0}}
                        control={
                            <Switch
                                size="small"
                                checked={position !== undefined}
                                onChange={(e) => {
                                    props.onOrderedChange(e.target.checked);
                                }}
                            />
                        }
                        label="In order"
                    />
                </Grid2>
            </Grid2>
            <Grid2 container spacing={2} sx={{marginTop: "0.5rem"}}>
                <SettingSelect
                    label="Passes"
                    value={`${entry.iterations}`}
                    options={iterationOptions}
                    friendlyNames={{}}
                    onChange={(value) => {
                        props.onChange({...entry, iterations: parseInt(value)});
                    }}
                />
                <SettingSelect
                    label="Mode"
                    value={entry.operationMode}
                    options={properties.operationModes}
                    friendlyNames={presetFriendlyNames as Record<PresetValue, string>}
                    onChange={(value) => {
                        props.onChange({...entry, operationMode: value});
                    }}
                />
                <SettingSelect
                    label="Fan speed"
                    value={entry.fanSpeed}
                    options={properties.fanSpeeds}
                    friendlyNames={presetFriendlyNames as Record<PresetValue, string>}
                    onChange={(value) => {
                        props.onChange({...entry, fanSpeed: value});
                    }}
                />
                <SettingSelect
                    label="Water usage"
                    value={entry.waterGrade}
                    options={properties.waterGrades}
                    friendlyNames={presetFriendlyNames as Record<PresetValue, string>}
                    onChange={(value) => {
                        props.onChange({...entry, waterGrade: value});
                    }}
                />
                <SettingSelect
                    label="Route"
                    value={entry.cleanRoute}
                    options={properties.cleanRoutes}
                    friendlyNames={routeFriendlyNames}
                    onChange={(value) => {
                        props.onChange({...entry, cleanRoute: value});
                    }}
                />
            </Grid2>
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

    const content = React.useMemo(() => {
        if (settingsError) {
            return (
                <Typography color="error" style={{textAlign: "center"}}>
                    Error loading the room cleaning settings.
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
                            setModified(true);
                        }}
                        onMove={(delta) => {
                            const newOrder = [...order];
                            newOrder.splice(position, 1);
                            newOrder.splice(position + delta, 0, id);

                            setOrder(newOrder);
                            setModified(true);
                        }}
                        onOrderedChange={(ordered) => {
                            setOrder(ordered ? [...order, id] : order.filter(o => {
                                return o !== id;
                            }));
                            setModified(true);
                        }}
                    />
                </Grid2>
            );
        });
    }, [settingsError, settingsPending, properties, sortedIds, order, entries, getName]);

    return (
        <PaperContainer>
            <Grid2 container direction="row">
                <Box style={{width: "100%"}}>
                    <DetailPageHeaderRow
                        title="Room cleaning settings"
                        icon={<SegmentCleaningSettingsIcon/>}
                        helpText={SegmentCleaningSettingsHelp}
                        onRefreshClick={() => {
                            setModified(false);
                            refetchSettings().catch(() => {
                                /* intentional */
                            });
                        }}
                        isRefreshing={settingsFetching}
                    />

                    <Typography variant="body2" sx={{marginTop: "1rem", marginBottom: "1rem"}}>
                        The order applies to every cleanup of several rooms. The other settings only apply in the
                        Personalized operation mode.
                    </Typography>

                    <Grid2 container direction="column">
                        {content}
                    </Grid2>

                    <Grid2 container justifyContent="flex-end" spacing={1}>
                        <Button
                            disabled={!modified || saving}
                            onClick={() => {
                                setModified(false);
                            }}
                        >
                            Discard
                        </Button>
                        <Button
                            variant="outlined"
                            disabled={!modified || saving}
                            onClick={() => {
                                saveSettings(
                                    {
                                        order: order,
                                        segments: Object.values(entries)
                                    },
                                    {
                                        onSettled: () => {
                                            setModified(false);
                                        }
                                    }
                                );
                            }}
                        >
                            Save
                        </Button>
                    </Grid2>
                </Box>
            </Grid2>
        </PaperContainer>
    );
};

export default SegmentCleaningSettings;

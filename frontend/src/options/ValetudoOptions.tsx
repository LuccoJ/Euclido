import React from "react";
import {
    RestartAlt as ConfigRestoreIcon,
    SystemUpdateAlt as UpdaterIcon,
    Badge as FriendlyNameIcon,
    Highlight as EmergencyLightIcon,
} from "@mui/icons-material";
import {ListMenu} from "../components/list_menu/ListMenu";
import PaperContainer from "../components/PaperContainer";
import {
    UpdaterConfiguration,
    Capability,
    useEmergencyLightMutation,
    useEmergencyLightStateQuery,
    useRestoreDefaultConfigurationMutation,
    useUpdaterConfigurationMutation,
    useUpdaterConfigurationQuery,
    useValetudoCustomizationsMutation,
    useValetudoCustomizationsQuery
} from "../api";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";
import {ButtonListMenuItem} from "../components/list_menu/ButtonListMenuItem";
import {SelectListMenuItem, SelectListMenuItemOption} from "../components/list_menu/SelectListMenuItem";
import {SpacerListMenuItem} from "../components/list_menu/SpacerListMenuItem";
import { TextEditModalListMenuItem } from "../components/list_menu/TextEditModalListMenuItem";
import { DuststreamingListMenuItem } from "../components/list_menu/DuststreamingListMenuItem";


const ConfigRestoreButtonListMenuItem = (): React.ReactElement => {
    const {
        mutate: restoreDefaultConfiguration,
        isPending: restoreDefaultConfigurationIsExecuting
    } = useRestoreDefaultConfigurationMutation();

    return (
        <ButtonListMenuItem
            primaryLabel="Restore Default Configuration"
            secondaryLabel="This will only affect Euclido"
            icon={<ConfigRestoreIcon/>}
            buttonLabel="Go"
            buttonColor={"error"}
            confirmationDialog={{
                title: "Restore default Euclido configuration?",
                body: "Are you sure that you want to restore the default configuration? This will not affect Wi-Fi settings, Map data etc."
            }}
            action={() => {
                restoreDefaultConfiguration();
            }}
            actionLoading={restoreDefaultConfigurationIsExecuting}
        />
    );
};

const FriendlyNameEditModalListMenuItem = (): React.ReactElement => {
    const {
        data: valetudoCustomizations,
        isPending: valetudoCustomizationsPending,
    } = useValetudoCustomizationsQuery();
    const {
        mutate: updateValetudoCustomizations,
        isPending: valetudoCustomizationsUpdating
    } = useValetudoCustomizationsMutation();

    const description = "Set a custom friendly name for Network Advertisement, MQTT etc.";
    let secondaryLabel = description;

    if (valetudoCustomizations && valetudoCustomizations.friendlyName !== "") {
        secondaryLabel = valetudoCustomizations.friendlyName;
    }

    return (
        <TextEditModalListMenuItem
            isLoading={valetudoCustomizationsPending || valetudoCustomizationsUpdating}
            value={valetudoCustomizations?.friendlyName ?? ""}

            dialog={{
                title: "Custom Friendly Name",
                description: description,

                validatingTransformer: (newValue: string) => {
                    return newValue.replace(/[^a-zA-Z0-9 -]/g, "").slice(0,24);
                },
                onSave: (newValue: string) => {
                    updateValetudoCustomizations({
                        friendlyName: newValue
                    });
                }
            }}

            icon={<FriendlyNameIcon/>}
            primaryLabel={"Custom Friendly Name"}
            secondaryLabel={secondaryLabel}
        />
    );
};

// Euclido only has nightly builds for now
const updateProviders : Array<SelectListMenuItemOption> = [
    {
        value: "github_nightly",
        label: "Nightly"
    }
];

const UpdateProviderSelectListMenuItem = (): React.ReactElement => {
    const {
        isPending: configurationPending,
        isError: configurationError,
    } = useUpdaterConfigurationQuery();

    const {mutate: updateConfiguration, isPending: configurationUpdating} = useUpdaterConfigurationMutation();

    const disabled = configurationPending || configurationUpdating || configurationError;

    const currentValue = updateProviders[0];

    return (
        <SelectListMenuItem
            options={updateProviders}
            currentValue={currentValue}
            setValue={(e) => {
                updateConfiguration({
                    updateProvider: e.value
                } as UpdaterConfiguration);
            }}
            disabled={disabled}
            loadingOptions={false}
            loadError={configurationError}
            primaryLabel="Update Channel"
            secondaryLabel="Select the channel used by the inbuilt updater"
            icon={<UpdaterIcon/>}
        />
    );
};

const emergencyLightLevels: Array<SelectListMenuItemOption> = [0, 25, 50, 75, 100].map(level => {
    return {
        value: `${level}`,
        label: level === 0 ? "Off" : `${level}%`
    };
});

const EmergencyLightSelectListMenuItem = (): React.ReactElement => {
    const {data, isPending, isError} = useEmergencyLightStateQuery();
    const {mutate: setLevel, isPending: updating} = useEmergencyLightMutation();

    const currentValue = emergencyLightLevels.find(option => {
        return option.value === `${data?.level}`;
    }) ?? {value: `${data?.level ?? ""}`, label: data ? `${data.level}%` : ""};

    return (
        <SelectListMenuItem
            options={emergencyLightLevels}
            currentValue={currentValue}
            setValue={(e) => {
                setLevel(parseInt(e.value));
            }}
            disabled={isPending || updating || isError}
            loadingOptions={false}
            loadError={isError}
            primaryLabel="Emergency Light"
            secondaryLabel="Turn on the robot's light when its dock loses power"
            icon={<EmergencyLightIcon/>}
        />
    );
};

const ValetudoOptions = (): React.ReactElement => {
    const [duststreamingCapabilitySupported, emergencyLightCapabilitySupported] = useCapabilitiesSupported(
        Capability.Duststreaming,
        Capability.EmergencyLightControl,
    );

    const listItems = React.useMemo(() => {
        const items = [
            <ConfigRestoreButtonListMenuItem key={"configRestoreAction"}/>,
            <SpacerListMenuItem key={"spacer0"}/>,
            <FriendlyNameEditModalListMenuItem key={"friendlyName"}/>,
            <UpdateProviderSelectListMenuItem key={"updateProviderSelect"}/>,
        ];

        if (emergencyLightCapabilitySupported) {
            items.push(<EmergencyLightSelectListMenuItem key={"emergencyLight"}/>);
        }

        if (duststreamingCapabilitySupported) {
            items.push(
                <SpacerListMenuItem key={"spacer1"}/>,
                <DuststreamingListMenuItem key={"duststreaming"}/>
            );
        }

        return items;
    }, [duststreamingCapabilitySupported, emergencyLightCapabilitySupported]);

    return (
        <PaperContainer>
            <ListMenu
                primaryHeader={"Euclido Options"}
                secondaryHeader={"Tunables and actions provided by Euclido"}
                listItems={listItems}
            />
        </PaperContainer>
    );
};

export default ValetudoOptions;

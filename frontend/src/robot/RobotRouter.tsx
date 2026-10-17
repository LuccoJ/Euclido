import {Route} from "react-router";
import {Navigate, Routes} from "react-router-dom";
import Duststream from "./Duststream";
import Consumables from "./Consumables";
import ManualControl from "./ManualControl";
import TotalStatistics from "./TotalStatistics";
import SegmentCleaningSettings from "../options/SegmentCleaningSettings";
import React from "react";
import {Capability, useDuststreamingConfigurationQuery} from "../api";
import {useCapabilitiesSupported} from "../CapabilitiesProvider";

const RobotRouter = (): React.ReactElement => {
    const [duststreamingSupported] = useCapabilitiesSupported(Capability.Duststreaming);
    const [segmentCleaningSettingsSupported] = useCapabilitiesSupported(Capability.MapSegmentCleaningSettings);
    const {data: duststreamingConfiguration} = useDuststreamingConfigurationQuery({
        enabled: duststreamingSupported
    });
    const duststreamingPossible = duststreamingSupported && duststreamingConfiguration?.enabled !== false;

    return (
        <Routes>
            <Route path={"camera"} element={duststreamingPossible ? <Duststream/> : <Navigate to="/" />}/>
            <Route path={"consumables"} element={<Consumables/>}/>
            <Route path={"manual_control"} element={<ManualControl/>}/>
            <Route path={"total_statistics"} element={<TotalStatistics/>}/>
            {segmentCleaningSettingsSupported && <Route path={"room_settings"} element={<SegmentCleaningSettings/>}/>}

            <Route path="*" element={<Navigate to="/" />} />
        </Routes>
    );
};

export default RobotRouter;

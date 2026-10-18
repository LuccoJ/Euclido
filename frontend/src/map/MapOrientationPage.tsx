import {Box, Button, CircularProgress, Grid2, styled, Typography, useTheme} from "@mui/material";
import {
    RotateLeft as RotateLeftIcon,
    RotateRight as RotateRightIcon,
} from "@mui/icons-material";
import React from "react";
import BaseMap, {MapContainer, MapProps, MapState} from "./BaseMap";
import {ActionButton, ActionsContainer} from "./Styled";
import {useMapRotation, useRobotMapQuery, useValetudoCustomizationsMutation} from "../api";

const Container = styled(Box)({
    flex: "1",
    height: "100%",
    display: "flex",
    flexFlow: "column",
    justifyContent: "center",
    alignItems: "center",
});

interface OrientationMapProps extends MapProps {
    onRotate: (delta: number) => void;
    rotating: boolean;
}

/**
 * The map as it is shown everywhere else, with buttons to turn it in steps of 90 degrees
 */
class OrientationMap extends BaseMap<OrientationMapProps, MapState> {
    constructor(props: OrientationMapProps) {
        super(props);

        this.state = {
            selectedSegmentIds: [],
            dialogOpen: false,
            dialogTitle: "",
            dialogBody: ""
        };
    }

    render(): React.ReactElement {
        return (
            <MapContainer style={{overflow: "hidden"}}>
                <canvas
                    ref={this.canvasRef}
                    style={{
                        width: "100%",
                        height: "100%",
                        imageRendering: "crisp-edges"
                    }}
                />
                <ActionsContainer>
                    <Grid2 container spacing={1} direction="row-reverse" sx={{background: "transparent"}}>
                        <Grid2>
                            <ActionButton
                                color="inherit"
                                size="medium"
                                variant="extended"
                                disabled={this.props.rotating}
                                onClick={() => {
                                    this.props.onRotate(90);
                                }}
                            >
                                <RotateRightIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                                Rotate right
                            </ActionButton>
                        </Grid2>
                        <Grid2>
                            <ActionButton
                                color="inherit"
                                size="medium"
                                variant="extended"
                                disabled={this.props.rotating}
                                onClick={() => {
                                    this.props.onRotate(-90);
                                }}
                            >
                                <RotateLeftIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                                Rotate left
                            </ActionButton>
                        </Grid2>
                    </Grid2>
                </ActionsContainer>
            </MapContainer>
        );
    }

    //eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    protected onTap(evt: any): boolean | void {
        // Only for looking at
        return;
    }
}

const MapOrientationPage = (): React.ReactElement => {
    const {
        data: mapData,
        isPending: mapIsPending,
        isError: mapLoadError,
        refetch: refetchMap
    } = useRobotMapQuery();
    const theme = useTheme();
    const mapRotation = useMapRotation();
    const {mutate: saveCustomizations, isPending: saving} = useValetudoCustomizationsMutation();

    if (mapLoadError) {
        return (
            <Container>
                <Typography color="error">Error loading map data</Typography>
                <Box m={1}/>
                <Button color="primary" variant="contained" onClick={() => {
                    return refetchMap();
                }}>
                    Retry
                </Button>
            </Container>
        );
    }

    if (!mapData && mapIsPending) {
        return (
            <Container>
                <CircularProgress/>
            </Container>
        );
    }

    if (!mapData) {
        return (
            <Container>
                <Typography align="center">No map data</Typography>
            </Container>
        );
    }

    return (
        <OrientationMap
            rawMap={mapData}
            paletteMode={theme.palette.mode}
            rotation={mapRotation}
            rotating={saving}
            onRotate={(delta) => {
                saveCustomizations({mapRotation: (((mapRotation + delta) % 360) + 360) % 360});
            }}
        />
    );
};

export default MapOrientationPage;

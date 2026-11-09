import React from "react";
import {Grid2} from "@mui/material";
import {Undo as UndoIcon} from "@mui/icons-material";
import {ActionButton} from "../../Styled";

// Undoes the latest change in a map editor (Ctrl+Z or Cmd+Z does the same)
const UndoActionButton = (props: { disabled: boolean, onClick: () => void }): React.ReactElement => {
    return (
        <Grid2>
            <ActionButton
                color="inherit"
                size="medium"
                variant="extended"
                disabled={props.disabled}
                onClick={props.onClick}
                title="Undo the latest change (Ctrl+Z)"
            >
                <UndoIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                Undo
            </ActionButton>
        </Grid2>
    );
};

export default UndoActionButton;

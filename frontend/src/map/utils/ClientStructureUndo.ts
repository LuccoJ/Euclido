import ClientStructure from "../structures/client_structures/ClientStructure";
import {getStructureCoordinates, setStructureCoordinates} from "./mapKeyboard";

type Snapshot = Array<{
    structure: ClientStructure,
    coordinates: Record<string, number>,
    active: boolean
}>;

/**
 * Undo for the latest change in a map editor: adding, removing, moving or resizing a zone, wall, area etc.
 * It keeps a single step, not a history.
 */
export class ClientStructureUndo {
    private current: Snapshot = [];
    private previous: Snapshot | null = null;
    private lastChangeKind: string | undefined = undefined;

    /**
     * Starts over from the given structures, e.g. after loading them from the robot
     *
     * @param {Array<ClientStructure>} structures - All structures currently on the map
     */
    reset(structures: Array<ClientStructure>): void {
        this.current = ClientStructureUndo.take(structures);
        this.previous = null;
        this.lastChangeKind = undefined;
    }

    /**
     * Call when an edit is finished. If anything changed, the state before it becomes what Undo goes back to.
     * Consecutive changes of the same kind (e.g. moving with the arrow keys) are undone together
     *
     * @param {Array<ClientStructure>} structures - All structures currently on the map
     * @param {string} [kind] - What kind of change it was, if consecutive ones should be undone together
     */
    record(structures: Array<ClientStructure>, kind?: string): void {
        const now = ClientStructureUndo.take(structures);

        if (ClientStructureUndo.isSame(now, this.current)) {
            return;
        }

        if (!(kind !== undefined && kind === this.lastChangeKind && this.previous !== null)) {
            this.previous = this.current;
        }

        this.current = now;
        this.lastChangeKind = kind;
    }

    canUndo(): boolean {
        return this.previous !== null;
    }

    /**
     * Puts the structures back as they were before the latest change
     *
     * @returns {Array<ClientStructure> | null} The structures to show, or null if there is nothing to undo
     */
    undo(): Array<ClientStructure> | null {
        if (this.previous === null) {
            return null;
        }

        this.previous.forEach(entry => {
            setStructureCoordinates(entry.structure, entry.coordinates);
            entry.structure.active = entry.active;
        });

        const structures = this.previous.map(entry => {
            return entry.structure;
        });

        this.reset(structures);

        return structures;
    }

    private static take(structures: Array<ClientStructure>): Snapshot {
        return structures.map(structure => {
            return {
                structure: structure,
                coordinates: getStructureCoordinates(structure),
                active: structure.active
            };
        });
    }

    /*
     * Selecting something isn't a change, and neither is the rounding to whole map pixels
     * that happens at the end of every drag, including one that only pans the map
     */
    private static isSame(a: Snapshot, b: Snapshot): boolean {
        const rounded = (coordinates: Record<string, number>) => {
            return JSON.stringify(Object.entries(coordinates).map(([key, value]) => {
                return [key, Math.round(value)];
            }));
        };

        return a.length === b.length && a.every((entry, i) => {
            return (
                entry.structure === b[i].structure &&
                rounded(entry.coordinates) === rounded(b[i].coordinates)
            );
        });
    }
}

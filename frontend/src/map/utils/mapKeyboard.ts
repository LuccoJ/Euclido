import ClientStructure from "../structures/client_structures/ClientStructure";

/*
 * Helpers for the map's keyboard shortcuts. Client structures (zones, walls, areas, ...) keep their
 * points as x0, y0, x1, y1 and so on in map space; these work on whichever of them a structure has.
 */

const COORDINATE_KEYS = ["x0", "y0", "x1", "y1", "x2", "y2", "x3", "y3"];

/**
 * The points of a structure by name (x0, y0, x1, ...)
 *
 * @param {ClientStructure} structure - A zone, wall, area etc.
 * @returns {Record<string, number>}
 */
export function getStructureCoordinates(structure: ClientStructure): Record<string, number> {
    const fields = structure as unknown as Record<string, unknown>;
    const coordinates: Record<string, number> = {};

    COORDINATE_KEYS.forEach(key => {
        const value = fields[key];

        if (typeof value === "number") {
            coordinates[key] = value;
        }
    });

    return coordinates;
}

/**
 * Puts back points taken with getStructureCoordinates
 *
 * @param {ClientStructure} structure - A zone, wall, area etc.
 * @param {Record<string, number>} coordinates - Its points by name
 */
export function setStructureCoordinates(structure: ClientStructure, coordinates: Record<string, number>): void {
    Object.assign(structure, coordinates);
}

/**
 * Moves a whole structure, in map space
 *
 * @param {ClientStructure} structure - A zone, wall, area etc.
 * @param {number} dx - Map pixels along x
 * @param {number} dy - Map pixels along y
 */
export function moveStructure(structure: ClientStructure, dx: number, dy: number): void {
    const coordinates = getStructureCoordinates(structure);

    Object.keys(coordinates).forEach(key => {
        coordinates[key] += key.startsWith("x") ? dx : dy;
    });

    setStructureCoordinates(structure, coordinates);
}

/**
 * Turns a direction on screen (e.g. right is 1, 0) into one step of one map pixel in the same direction
 * in map space, which differs from the screen when the map is shown rotated
 *
 * @param {DOMMatrix} transformationMatrixToScreenSpace - The transformation from map space to screen space
 * @param {number} dx - The direction to the right on screen
 * @param {number} dy - The direction downwards on screen
 * @returns {{x: number, y: number}}
 */
export function screenDirectionToMapStep(transformationMatrixToScreenSpace: DOMMatrix, dx: number, dy: number): { x: number, y: number } {
    const m = DOMMatrix.fromMatrix(transformationMatrixToScreenSpace).invertSelf();
    const x = m.a * dx + m.c * dy;
    const y = m.b * dx + m.d * dy;
    const length = Math.hypot(x, y);

    return {
        x: Math.round(x / length),
        y: Math.round(y / length)
    };
}

/**
 * Sorts structures by where they are on screen, top to bottom and then left to right, for stepping
 * through them with Tab
 *
 * @param {Array<ClientStructure>} structures - The structures to sort
 * @param {DOMMatrix} transformationMatrixToScreenSpace - The transformation from map space to screen space
 * @returns {Array<ClientStructure>}
 */
export function sortByScreenPosition(structures: Array<ClientStructure>, transformationMatrixToScreenSpace: DOMMatrix): Array<ClientStructure> {
    const centers = new Map(structures.map(structure => {
        const coordinates = getStructureCoordinates(structure);
        const xs = Object.keys(coordinates).filter(k => {
            return k.startsWith("x");
        }).map(k => {
            return coordinates[k];
        });
        const ys = Object.keys(coordinates).filter(k => {
            return k.startsWith("y");
        }).map(k => {
            return coordinates[k];
        });
        const center = new DOMPoint(
            (Math.min(...xs) + Math.max(...xs)) / 2,
            (Math.min(...ys) + Math.max(...ys)) / 2
        ).matrixTransform(transformationMatrixToScreenSpace);

        return [structure, center];
    }));

    return [...structures].sort((a, b) => {
        const ca = centers.get(a)!;
        const cb = centers.get(b)!;

        return ca.y !== cb.y ? ca.y - cb.y : ca.x - cb.x;
    });
}

/**
 * Whether a key press is meant for something else than the map: a text field, or a dialog
 *
 * @param {EventTarget | null} target - The event's target
 * @returns {boolean}
 */
export function isKeyForSomethingElse(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (
            target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
            target.closest("[role=\"dialog\"]") !== null
        )
    );
}

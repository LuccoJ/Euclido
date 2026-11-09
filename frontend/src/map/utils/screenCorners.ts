/*
 * The map can be shown rotated in steps of 90°, while all structures keep their coordinates in map space.
 * The helpers below only decide which corner of a rectangle gets which button, so that the remove button
 * stays at the top left of the screen and the resize button at the bottom right, whatever the rotation.
 */

/**
 * For an axis-aligned rectangle in map space, whether the corner shown at the top left of the screen is
 * at the smaller (true) or the larger (false) x and y. The corner at the bottom right is the opposite one
 *
 * @param {DOMMatrix} transformationMatrixToScreenSpace - The transformation from map space to screen space
 */
export function getScreenTopLeftEdges(transformationMatrixToScreenSpace: DOMMatrixInit): { xIsMin: boolean, yIsMin: boolean } {
    const m = DOMMatrix.fromMatrix(transformationMatrixToScreenSpace);

    // screen x + screen y grows with (a + b) per map x and (c + d) per map y; the top left corner is where it's smallest
    return {
        xIsMin: m.a + m.b > 0,
        yIsMin: m.c + m.d > 0
    };
}

/**
 * Whether map x runs up and down on screen, i.e. the map is shown turned by 90° or 270°
 *
 * @param {DOMMatrix} transformationMatrixToScreenSpace - The transformation from map space to screen space
 */
export function isShownSideways(transformationMatrixToScreenSpace: DOMMatrixInit): boolean {
    const m = DOMMatrix.fromMatrix(transformationMatrixToScreenSpace);

    return Math.abs(m.b) > Math.abs(m.a);
}

/**
 * The corners of an axis-aligned rectangle that are shown at the top left and bottom right of the screen
 *
 * @param {object} bounds - The rectangle in map space
 * @param {number} bounds.minX
 * @param {number} bounds.minY
 * @param {number} bounds.maxX
 * @param {number} bounds.maxY
 * @param {DOMMatrix} transformationMatrixToScreenSpace - The transformation from map space to screen space
 */
export function getScreenCorners(
    bounds: { minX: number, minY: number, maxX: number, maxY: number },
    transformationMatrixToScreenSpace: DOMMatrixInit
): { topLeft: DOMPoint, bottomRight: DOMPoint } {
    const {xIsMin, yIsMin} = getScreenTopLeftEdges(transformationMatrixToScreenSpace);

    return {
        topLeft: new DOMPoint(
            xIsMin ? bounds.minX : bounds.maxX,
            yIsMin ? bounds.minY : bounds.maxY
        ).matrixTransform(transformationMatrixToScreenSpace),
        bottomRight: new DOMPoint(
            xIsMin ? bounds.maxX : bounds.minX,
            yIsMin ? bounds.maxY : bounds.minY
        ).matrixTransform(transformationMatrixToScreenSpace)
    };
}

/**
 * Where an edge of a rectangle ends up when it's dragged by delta (all in map space, along one axis).
 * It doesn't move if that would bring it closer than minSize to the opposite edge, or if the pointer is already past it
 *
 * @param {number} edge - The edge being dragged
 * @param {number} oppositeEdge - The edge that stays put
 * @param {number} delta - How far the pointer moved
 * @param {number} pointer - Where the pointer is now
 * @param {number} minSize - The smallest the rectangle may get
 */
export function dragRectangleEdge(edge: number, oppositeEdge: number, delta: number, pointer: number, minSize: number): number {
    if (edge >= oppositeEdge) {
        return (pointer > oppositeEdge + minSize && edge + delta > oppositeEdge + minSize) ? edge + delta : edge;
    } else {
        return (pointer < oppositeEdge - minSize && edge + delta < oppositeEdge - minSize) ? edge + delta : edge;
    }
}

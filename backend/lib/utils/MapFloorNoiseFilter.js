const MapLayer = require("../entities/map/MapLayer");

/**
 * Removes small specks of floor and wall that don't touch any room from maps.
 *
 * Lidars see through windows and get reflections, which leave streaks of floor and stray wall pixels outside the
 * rooms. Besides cluttering the map, they make the default zoom smaller, as the map is fitted to all of its layers.
 *
 * A group of connected floor pixels is kept if it touches a segment or is large, so that floor next to rooms (like a
 * balcony) and areas that aren't segmented yet stay. Wall pixels are then kept if they touch a segment or the floor
 * that was kept, or are a large group themselves. Maps without segments are left alone.
 */
class MapFloorNoiseFilter {
    /**
     * Filters the map in place. Maps that were already filtered are skipped.
     *
     * @param {import("../entities/map/ValetudoMap")} map
     */
    static FILTER(map) {
        if (!map || FILTERED_MAPS.has(map)) {
            return;
        }
        FILTERED_MAPS.add(map);

        const segments = map.layers.filter(layer => {
            return layer.type === MapLayer.TYPE.SEGMENT;
        });
        if (segments.length === 0 || !(map.pixelSize > 0)) {
            return;
        }

        const minKeptPixels = Math.ceil(MIN_KEPT_AREA / (map.pixelSize * map.pixelSize));

        filterLayerOfType(map, MapLayer.TYPE.FLOOR, segments, minKeptPixels);

        const anchors = map.layers.filter(layer => {
            return layer.type === MapLayer.TYPE.SEGMENT || layer.type === MapLayer.TYPE.FLOOR;
        });
        filterLayerOfType(map, MapLayer.TYPE.WALL, anchors, minKeptPixels);
    }
}

/**
 * Drops the groups of connected pixels of the layer that touch none of the anchor layers and are small
 *
 * @param {import("../entities/map/ValetudoMap")} map
 * @param {string} type
 * @param {Array<import("../entities/map/MapLayer")>} anchors
 * @param {number} minKeptPixels
 */
function filterLayerOfType(map, type, anchors, minKeptPixels) {
    const layerIndex = map.layers.findIndex(layer => {
        return layer.type === type;
    });
    if (layerIndex === -1) {
        return;
    }

    const layer = map.layers[layerIndex];
    const minX = layer.dimensions.x.min - 1;
    const minY = layer.dimensions.y.min - 1;
    const width = layer.dimensions.x.max - minX + 2;
    const height = layer.dimensions.y.max - minY + 2;
    const grid = new Uint8Array(width * height);

    for (const anchor of anchors) {
        markRuns(grid, anchor.compressedPixels, minX, minY, width, height, ANCHOR);
    }
    markRuns(grid, layer.compressedPixels, minX, minY, width, height, PIXEL);

    const keep = new Uint8Array(width * height);
    const visited = new Uint8Array(width * height);
    const stack = [];
    const component = [];
    let removed = 0;

    for (let start = 0; start < grid.length; start++) {
        if (grid[start] !== PIXEL || visited[start]) {
            continue;
        }

        let touchesAnchor = false;
        component.length = 0;
        stack.push(start);
        visited[start] = 1;

        while (stack.length > 0) {
            const i = stack.pop();
            const x = i % width;
            const y = (i - x) / width;

            component.push(i);

            // The grid has a border of one empty pixel around the layer, so neighbours never wrap around
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) {
                        continue;
                    }

                    const n = (y + dy) * width + x + dx;
                    if (grid[n] === PIXEL) {
                        if (!visited[n]) {
                            visited[n] = 1;
                            stack.push(n);
                        }
                    } else if (grid[n] === ANCHOR) {
                        touchesAnchor = true;
                    }
                }
            }
        }

        if (touchesAnchor || component.length >= minKeptPixels) {
            for (const i of component) {
                keep[i] = 1;
            }
        } else {
            removed += component.length;
        }
    }

    if (removed === 0) {
        return;
    }

    // Row by row, which is the order MapLayer.COORDINATE_TUPLE_SORT gives
    const pixels = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (keep[y * width + x]) {
                pixels.push(x + minX, y + minY);
            }
        }
    }

    map.metaData.totalLayerArea -= layer.metaData.area;

    if (pixels.length === 0) {
        map.layers.splice(layerIndex, 1);
        return;
    }

    const metaData = Object.assign({}, layer.metaData);
    delete metaData.area;
    const filtered = new MapLayer({
        pixels: pixels,
        type: type,
        metaData: metaData
    });
    filtered.metaData.area = filtered.dimensions.pixelCount * (map.pixelSize * map.pixelSize);

    map.metaData.totalLayerArea += filtered.metaData.area;
    map.layers[layerIndex] = filtered;
}

/**
 * @param {Uint8Array} grid
 * @param {Array<number>} runs [x, y, count, ...]
 * @param {number} minX
 * @param {number} minY
 * @param {number} width
 * @param {number} height
 * @param {number} value
 */
function markRuns(grid, runs, minX, minY, width, height, value) {
    for (let i = 0; i < runs.length; i += 3) {
        const y = runs[i + 1] - minY;
        if (y < 0 || y >= height) {
            continue;
        }

        const xStart = Math.max(runs[i] - minX, 0);
        const xEnd = Math.min(runs[i] - minX + runs[i + 2], width);
        for (let x = xStart; x < xEnd; x++) {
            grid[y * width + x] = value;
        }
    }
}

const PIXEL = 1;
const ANCHOR = 2;
// Half a square metre, in cm²
const MIN_KEPT_AREA = 5000;
/** @type {WeakSet<object>} */
const FILTERED_MAPS = new WeakSet();

module.exports = MapFloorNoiseFilter;

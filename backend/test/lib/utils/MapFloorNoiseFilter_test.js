const assert = require("node:assert");
const { describe, it } = require("node:test");

const MapFloorNoiseFilter = require("../../../lib/utils/MapFloorNoiseFilter");
const MapLayer = require("../../../lib/entities/map/MapLayer");
const ValetudoMap = require("../../../lib/entities/map/ValetudoMap");

function square(x, y, size) {
    const pixels = [];
    for (let py = y; py < y + size; py++) {
        for (let px = x; px < x + size; px++) {
            pixels.push(px, py);
        }
    }

    return pixels;
}

function floorPixelCount(map) {
    return map.layers.find(layer => {
        return layer.type === MapLayer.TYPE.FLOOR;
    })?.dimensions.pixelCount ?? 0;
}

function buildMap(floorPixels, withSegment) {
    const layers = [new MapLayer({pixels: floorPixels, type: MapLayer.TYPE.FLOOR})];
    if (withSegment) {
        layers.push(new MapLayer({pixels: square(10, 10, 10), type: MapLayer.TYPE.SEGMENT, metaData: {segmentId: "1"}}));
    }

    return new ValetudoMap({
        size: {x: 5120, y: 5120},
        pixelSize: 5,
        layers: layers,
        entities: []
    });
}

describe("MapFloorNoiseFilter", () => {
    it("keeps floor touching a segment and large floor, and removes small isolated specks", () => {
        const touching = square(20, 10, 3); // right next to the segment
        const speck = square(50, 50, 2);
        const large = square(80, 80, 15); // 225 pixels, more than half a square metre
        const map = buildMap(sortPixels([...touching, ...speck, ...large]), true);

        MapFloorNoiseFilter.FILTER(map);

        assert.strictEqual(floorPixelCount(map), 9 + 225);
        assert.strictEqual(map.metaData.totalLayerArea, (9 + 225 + 100) * 25);
    });

    it("removes the floor layer when only specks are left", () => {
        const map = buildMap(sortPixels(square(50, 50, 2)), true);

        MapFloorNoiseFilter.FILTER(map);

        assert.strictEqual(floorPixelCount(map), 0);
        assert.strictEqual(map.metaData.totalLayerArea, 100 * 25);
    });

    it("removes stray wall pixels but keeps walls around rooms", () => {
        const map = buildMap(sortPixels(square(80, 80, 15)), true);
        map.addLayer(new MapLayer({
            pixels: sortPixels([...square(9, 10, 1), ...square(200, 5, 1), ...square(95, 80, 1)]),
            type: MapLayer.TYPE.WALL
        }));

        MapFloorNoiseFilter.FILTER(map);

        const walls = map.layers.find(layer => {
            return layer.type === MapLayer.TYPE.WALL;
        });
        assert.strictEqual(walls.dimensions.pixelCount, 2); // next to the segment and next to the large floor
        assert.strictEqual(walls.dimensions.x.max, 95);
        assert.strictEqual(walls.dimensions.y.min, 10);
    });

    it("leaves maps without segments alone", () => {
        const map = buildMap(sortPixels(square(50, 50, 2)), false);

        MapFloorNoiseFilter.FILTER(map);

        assert.strictEqual(floorPixelCount(map), 4);
    });
});

function sortPixels(pixels) {
    const tuples = [];
    for (let i = 0; i < pixels.length; i += 2) {
        tuples.push([pixels[i], pixels[i + 1]]);
    }

    return tuples.sort(MapLayer.COORDINATE_TUPLE_SORT).flat();
}

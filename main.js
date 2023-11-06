const canvas = $('#playfield')[0];
const ctx = canvas.getContext('2d');

const GRAVITY = 9.8;
const TERMINAL_VELOCITY = -300;
const MOVE_SPEED = 4;

const range = (from, end) => {
    return [...Array(end - from + 1)].map((_, i) => i+from);
};

/// Wrapper around function Loop() to provide deltatime
const Looper = (() => {
    var previousTime = 0;
    const loopWrapper = (time) => {
        const deltaTime = time - previousTime;
        previousTime = time;
        
        ctx.printRs();
        loop(deltaTime);
        requestAnimationFrame(loopWrapper);
    }
    return { loopWrapper };
})();

/// Handle input
const input = (() => {
    var a_down = false, d_down = false;
    var mx = 0, my = 0;

    const canvasOffset = {
        x: $(canvas).offset().left,
        y: $(canvas).offset().top
    };

    const getKeys = () => {
        return { a_down, d_down}
    };

    const getMousePos = () => {
        return { x: mx, y: my };
    };

    const getMousePosBlocky = () => {
        return {
            x: mx / zoom + player.x - (canvas.width / 2 / zoom),
            y: -my / zoom + player.y + (canvas.height / 2 / zoom) + 1
        };
    };

    const downEvt = (e) => {
        switch (e.key) {
            case 'w':
                player.jump();
                break;

            case 'a':
                a_down = true;
                break;

            case 'd':
                d_down = true;
                break;
        }
    };

    const upEvt = (e) => {
        switch (e.key) {
            case 'a':
                a_down = false;
                break;

            case 'd':
                d_down = false;
                break;
        }
    };

    const wheelEvt = (e) => {
        zoom = Math.max(1, zoom + (e.deltaY / -50));
    };

    const mouseMoveEvt = (e) => {
        mx = e.pageX - canvasOffset.x;
        my = e.pageY - canvasOffset.y;
    };

    return {
        getKeys,
        getMousePos,
        getMousePosBlocky,
        downEvt,
        upEvt,
        wheelEvt,
        mouseMoveEvt,
    };
})();

const listeners = {
    'keydown': input.downEvt,
    'keyup': input.upEvt,
    'wheel': input.wheelEvt,
    'mousemove': input.mouseMoveEvt,
};

for (const listener in listeners) {
    window.addEventListener(listener, listeners[listener], false);
}

requestAnimationFrame(Looper.loopWrapper);

/// Math
const round = (x, precision = 0.1) => {
    return Math.round(x * (precision*10)) / (precision*10);
}

/// Context function expansion

// Clear context
const ctxClear = () => ctx.clearRect(0, 0, canvas.width, canvas.height);

// Write specific
const ctxWrite = (str, x, y, color, size, font = 'serif') => {
    ctx.fillStyle = color;
    ctx.font = `${size} ${font}`;
    ctx.fillText(str, x, y);    
};

// Fill rect with zoom and offset from player position
const ctxRectZoom = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    const z = zoom;

    const px = player.x + 0.5, py = player.y + 0.5;

    const final_X = (x - px) * z + (canvas.width / 2);
    const final_Y = (-y + py) * z + (canvas.height / 2);

    ctx.fillRect(final_X, final_Y, w * z + 0.5, h * z + 0.5);
};

// Print with managed X, Y
const Printer = (() => {
    var X = 0;
    var Y = 0;

    const print = (str, color = 'deeppink') => {
        ctxWrite(str, X, Y, color, '12px', 'consolas');
        X += str.length * 5;
    };

    const println = (str = '', color = 'deeppink') => {
        print(str, color);
        Y += 12;
        X = 4;
    };

    const resetPos = () => {
        X = 4;
        Y = 12;
    };

    resetPos();

    return { 
        print,
        println,
        resetPos
    };
})();

Object.assign(ctx, {
    clear: ctxClear,
    write: ctxWrite,

    rectZ: ctxRectZoom,

    print: Printer.print,
    println: Printer.println,
    printRs: Printer.resetPos
});

/// Debug Mode
const isDebug = () => $('#showDebugValues')[0].checked;
const printDbgInfo = (dt) => {
    const mpos = input.getMousePosBlocky();

    const display =
`Frametime: ${round(dt,1)}ms
FPS: ${round(1000/dt,1)}

Seed: ${chunkMgr.seed}

Player:
    X: ${round(player.x,1)}
    Y: ${round(player.y,1)}
   vX: ${round(player.xvel,1)}
   vY: ${round(player.yvel,1)}

Zoom: ${zoom}

ChunkN: ${chunkMgr.chunkN(player.x)}
Rendered chunks: [${chunkMgr.inView(player.x, zoom)}]

Mouse: (${Math.round(mpos.x)},${Math.round(mpos.y)})
  Chunk: ${chunkMgr.chunkN(Math.round(mpos.x))}
  Block: ${JSON.stringify(chunkMgr.blockAt(Math.round(mpos.x), Math.round(mpos.y)))}
`.split('\n');

    display.map(x => ctx.println(x));
};

/// Entities
class Entity {
    constructor() {
        Object.assign(this, {
            x: 0,
            y: 0,
            xvel: 0,
            yvel: 0
        });
    }

    doGravity = () => {
        this.yvel = Math.max(TERMINAL_VELOCITY, this.yvel - GRAVITY * window.dtms);
        this.y = Math.max(0/* TODO: Block Below Me */, this.y + this.yvel * window.dtms);
        if (this.y == 0) this.yvel = 0;
    };

    doPhysics() {
        this.doGravity();
        this.x += this.xvel * window.dtms;
    };

    onGround = () => {
        return this.yvel == 0 && this.y == 0;
    };

    jump = () => {
        if (!this.onGround()) return;
        this.yvel += 7;
    };

    render() {
        const x = this.x;
        const y = this.y;

        ctx.rectZ(x, y, 1, 1, 'deeppink');
        
        ctx.rectZ(x + 0.5, y, 0.5, 0.5, 'black');
        ctx.rectZ(x, y - 0.5, 0.5, 0.5, 'black');
    }
}

class Player extends Entity {
    constructor(username) {
        super();
        Object.assign(this, {
            username: username
        });
    }

    doPhysics() {
        if (this == player) {
            const keys = input.getKeys();

            this.xvel = 0;
            if (keys.a_down) this.xvel -= MOVE_SPEED;
            if (keys.d_down) this.xvel += MOVE_SPEED;    
        }
        
        super.doPhysics();
    }

    render() {
        const x = this.x;
        const y = this.y;
        
        ctx.rectZ(x, y+1, 1, 1, 'red');
        ctx.rectZ(x, y, 1, 1, 'blue');
    }
}

const player = new Player('steve');
const entities = [player, new Entity()];

/// Chunk and Blocks
const CHUNK_WIDTH = 16;
const CHUNK_HEIGHT = 56;

const chunkMgr = (() => {
    var chunks = {};

    const seed = Math.random();
    noise.seed(seed);

    // Generate a chunk
    const generate = (n) => {
        console.log('Generating chunk ' + n);
        const chunk = new Chunk();

        const xOffset = CHUNK_WIDTH * n;

        const caveNoise = [...Array(CHUNK_HEIGHT)].map((_, y) => 
                            [...Array(CHUNK_WIDTH)].map((_, x) => noise.perlin2((x + xOffset) / 10, y / 10)));
        
        data = caveNoise.map((layer) => layer.map((x) =>
            x = (x <= 0.05) ? 0 : 1));

        // Set bottom to diff block
        data[0] = data[0].map(x => x = 1);
        
        chunk.data = data;
        chunks[n] = chunk;
        return chunk;
    };

    // Return current chunk #
    const chunkN = (xpos) => Math.floor(xpos / CHUNK_WIDTH);

    // Return current chunk data
    const dataOf = (n) => chunks[n];

    // Return chunk # in view
    const inView = (xpos, zoom) => {
        const blocks_displayable = canvas.width / zoom;
        const directional_displayable = blocks_displayable / 2;

        const left_x = xpos - directional_displayable;
        const right_x = xpos + directional_displayable;

        const left_chunk = chunkN(left_x);
        const right_chunk = chunkN(right_x);

        return range(left_chunk, right_chunk);
    };

    // Whether chunk # exists
    const exists = (chunkN) => chunks.hasOwnProperty(chunkN);

    // Render chunk #
    const render = (chunkN) => {
        if (!exists(chunkN)) return;

        const chunkOffset = chunkN * CHUNK_WIDTH;
        const chunkData = dataOf(chunkN).data;
        for (const [y, layer] of chunkData.entries()) {
            for (const [x, block] of layer.entries()) {
                if (block == 0) continue; // air

                ctx.rectZ(x + chunkOffset, y, 1, 1, 'white'); // el cheapo method of showing a block is here
            }
        }
    };

    const blockAt = (xpos, ypos) => {
        if (ypos < 0 || ypos >= CHUNK_HEIGHT) return { what: 'out-of-range' };
        const negative = xpos < 0;

        const chunk = dataOf(chunkN(xpos));
        const layer = chunk.data[Math.floor(ypos)];
        const xpos_chunk = Math.floor((xpos % CHUNK_WIDTH + (negative*CHUNK_WIDTH)) % CHUNK_WIDTH);
        
        return {
            layer,
            xpos_chunk,
            block: layer[xpos_chunk]
        };
    };

    return {
        seed,
        chunks,

        generate,
        chunkN,
        dataOf,
        inView,
        exists,
        render,
        blockAt
    };
})();

// Generated by chunkMgr.generate
class Chunk {}

// Immediately generate spawn chunks
var zoom = 25.0;

// Pre-generate spawn chunks
chunkMgr.generate(-1);
chunkMgr.generate(0);

/// Game
const loop = (dt) => {
    window.dtms = dt / 1000;
    ctx.clear();
    
    /// Generation
    const chunksInView = chunkMgr.inView(player.x, zoom);
    for (const chunkN of chunksInView) {
        if (!chunkMgr.exists(chunkN)) chunkMgr.generate(chunkN);
    }

    /// Logic
    for (const entity of entities) {
        entity.doPhysics();
    }

    /// Rendering
    
    // Entities
    for (const entity of entities) {
        entity.render();
    }

    // Chunks
    for (const chunkN of chunksInView) {
        chunkMgr.render(chunkN);
    }

    /// Debug
    if (isDebug()) printDbgInfo(dt);
};

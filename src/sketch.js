const WIDTH = 300;
const HEIGHT = 60;
const cx = WIDTH / 2;
const cy = HEIGHT / 2;

const DENSITY = 10;

function setup() {
    createCanvas(WIDTH, HEIGHT);
    pixelDensity(2);
}

function draw() {
    clear();
    stroke(255);
    noFill();
    beginShape();
    for (let i = -1; i < 2*DENSITY + 2; i++) {
        let r = map(sin(2*i + frameCount*0.01), -1, 1, 0, HEIGHT*0.5);
        ellipse(map((i + sin(0.5*i + frameCount*0.01)) % DENSITY, 0, DENSITY, -HEIGHT*0.5, WIDTH+HEIGHT*0.5), HEIGHT / 2, r,r);
    }
    endShape();
}


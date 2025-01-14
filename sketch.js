let playerCamel;
let obstacles = [];
let healthItems = [];
let score = 0;
let gameOver = false;
let road;
let keys = {}; // Track key states
let customFont;
let health = 100; // Health bar
let level = 1; // Current game level
let maxHealth = 100; // Maximum health
let isVibrating = false;
let vibrationTimer = 0;
let vibrationDuration = 100; // Duration of vibration in milliseconds
let vibrationAmount = 15; // Amount of vibration (in pixels)

// Images
let bgImage, camelImage, redBoxImage, greenBoxImage, portalImage;

let portal; // Portal object
let portalTimer = 0; // Time spent in portal
let portalActive = false; // Flag to check if portal is active

// Game State
let gameState = "start"; // Possible values: "start", "playing", "gameOver"

function preload() {
  // Load the images
  bgImage = loadImage('assets/images/background.png');
  camelImage = loadImage('assets/images/camel.png');
  redBoxImage = loadImage('assets/images/cactus.png');
  greenBoxImage = loadImage('assets/images/shawarma.png');
  portalImage = loadImage('assets/images/portal.png');

  // Load a font for the game
  customFont = loadFont('https://cdnjs.cloudflare.com/ajax/libs/topcoat/0.8.0/font/SourceCodePro-Regular.otf');
}

function setup() {
  // Get the dimensions of the parent container
  const container = document.getElementById('sketch-container');
  const containerWidth = container.offsetWidth;
  const containerHeight = container.offsetHeight;

  // Create the canvas with the container's dimensions
  let cnv = createCanvas(containerWidth, containerHeight, WEBGL);

  // Attach the canvas to the div
  cnv.parent('sketch-container');

  // Apply your font
  textFont(customFont);

  // Initialize game objects
  playerCamel = new Camel(0, 200);
  road = new Road();
}

// Adjust canvas size dynamically when the window is resized
function windowResized() {
  const container = document.getElementById('sketch-container');
  resizeCanvas(container.offsetWidth, container.offsetHeight);
}


function draw() {
  if (gameState === "start") {
    showStartScreen();
  } else if (gameState === "playing") {
    gamePlay();
  } else if (gameState === "gameOver") {
    showGameOver();
  }
}

function keyPressed() {
  if (gameState === "start") {
    if (key === 'Enter') {
      gameState = "playing"; // Start the game when Enter is pressed
    }
  } else if (gameState === "playing") {
    keys[keyCode] = true;
    if (key === 'R' || key === 'r') {
      resetGame(); // Restart the game
    }
    if (score >= 3 && keyCode === ENTER) {
      if (portal && portal.hits(playerCamel)) {
        portalActive = true;
        portalTimer = 0; // Start timer
      }
    }
  }
}

function keyReleased() {
  keys[keyCode] = false;
}

function showStartScreen() {
  push();
  resetMatrix(); // Reset to 2D for Start Screen
  background(0); // Black background for start screen
  
  textSize(32);
  textAlign(CENTER, CENTER);
  fill(255);
  text("Camel Adventure Game", width / 4 -200, height / 4 -300);

  textSize(16);
  text("Press Enter to Start \n use arrow keys to move \n use R to reset the game ", width / 4 -200, height / 4 -200);
  
  pop();
}

function gamePlay() {
  // Desert background
  background(244, 164, 66); // Sandy desert background color
  image(bgImage, -width / 2, -height / 2, width, height); // Draw the background image

  if (!gameOver) {
    // Display moving road
    road.show();
    road.move();

    // Display and move player camel
    playerCamel.show();
    playerCamel.move();

    // Generate obstacles and health items
    if (frameCount % 60 === 0) {
      obstacles.push(new Obstacle(random(-width / 8, width / 8), -400));
      healthItems.push(new HealthItem(random(-width / 8, width / 8), -400)); // Generate green boxes
    }

    // Display and move obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
      obstacles[i].show();
      obstacles[i].move();

      // Check for collisions with obstacles
      if (obstacles[i].hits(playerCamel)) {
        health -= 10; // Reduce health when hitting an obstacle
        obstacles.splice(i, 1); // Remove the obstacle
        if (health <= 0) {
          gameOver = true; // End the game if health reaches 0
        }
      }

      // Remove off-screen obstacles and increase score
      if (obstacles[i].offScreen()) {
        obstacles.splice(i, 1);
        score++;
      }
    }

    // Display and move health items (green boxes)
    for (let i = healthItems.length - 1; i >= 0; i--) {
      healthItems[i].show();
      healthItems[i].move();

      // Check for collection of health items
      if (healthItems[i].hits(playerCamel)) {
        health = min(health + 20, maxHealth); // Increase health, but don't exceed max health
        healthItems.splice(i, 1); // Remove the health item
      }

      // Remove off-screen health items
      if (healthItems[i].offScreen()) {
        healthItems.splice(i, 1);
      }
    }

  // Show portal after score reaches 3
if (score >= 5 && !portal) {
  let portalX = random(-width / 8, width / 8); // Portal is placed within camel's movement range
  portal = new Portal(portalX, playerCamel.y);
}

if (portal) {
  portal.show();

  // Check if camel is in the portal
  if (portal.hits(playerCamel)) {
    if (!portalActive) {
      portalActive = true;
      portalTimer = 0; // Start timer
    }

    // Increase timer if active
    portalTimer += deltaTime / 1000; // Increment timer in seconds

    if (portalTimer >= 3) { // Change timer to 3 seconds
      // Redirect to another page
      window.location.href = "https://koulmesahil.github.io/"; // Replace with your desired URL or page
    }
  } else {
    portalActive = false;
    portalTimer = 0;
  }
}


    // Display score and health as a bar
    push();
    resetMatrix(); // Reset to 2D for HUD
    fill(255);
    textSize(16);
    textAlign(LEFT, TOP);
    text("Collect 3 shawarmas to open the portal\nStay away from the cactus \nStay in the portal for 3 seconds to move on.", -width / 2 + 10, -height / 2 + 10);
    
    // Health Bar
    fill(255, 0, 0);
    rect(width / 2 - 150, -height / 2 + 10, 300, 20);
    fill(0, 255, 0);
    rect(width / 2 - 150, -height / 2 + 10, map(health, 0, maxHealth, 0, 300), 20); // Health bar width changes with health

    // Score
    textSize(16);
    textAlign(RIGHT, TOP);
    fill(255,255,255)

    text(`Score: ${score}`, width / 2 - 10, -height / 2 + 40);
    pop();

    // Check for level up
    if (score >= level * 10) {
      //levelUp();
    }
  } else {
    // Display "The End" message
    showGameOver();
  }
}

function showGameOver() {
  push();
  resetMatrix(); // Reset to 2D for Game Over screen
  background(0); // Black background for "The End"
  textSize(32);
  textAlign(CENTER, CENTER);
  fill(255);
  text("The End", width / 2 - 300, height / 2 - 300);
  textSize(16);
  text("Press R to Restart", width / 2 - 300, height / 2 - 200);
  pop();
}
function resetGame() {
  gameState = "playing";  // Go back to the starting screen
  gameOver = false;
  obstacles = [];
  healthItems = [];
  score = 0;
  health = 100;
  level = 1;
  road.reset();
  portal = null;
  portalTimer = 0;
  portalActive = false;
  playerCamel.reset();
}


// The rest of the game classes (Camel, Obstacle, HealthItem, etc.) remain the same.




/////////////////

class Camel {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.width = 60; // Initial camel width
    this.height = 100; // Initial camel height
    this.speed = 5;
    this.velX = 0;  // Velocity for smoother movement
    this.sizeMultiplier = 1; // Size multiplier to increase camel size
  }

  show() {
    push();
    translate(this.x, this.y, 50);
    
    // Apply vibration offset if vibrating
    if (isVibrating) {
      let vibrationOffset = random(-vibrationAmount, vibrationAmount); // Randomize the vibration amount
      translate(vibrationOffset, 0); // Vibrate horizontally
      vibrationTimer += deltaTime; // Increment vibration timer
      if (vibrationTimer >= vibrationDuration) {
        isVibrating = false; // Stop vibrating after the duration
      }
    }
  
    imageMode(CENTER); // Draw image from the center
    
    // Apply size multiplier when drawing the camel
    image(camelImage, 0, 0, this.width * this.sizeMultiplier, this.height * this.sizeMultiplier); // Draw the camel image with increased size
    pop();
  }

  move() {
    if (keys[LEFT_ARROW]) {
      this.velX = -this.speed;  // Move left
    }
    if (keys[RIGHT_ARROW]) {
      this.velX = this.speed;  // Move right
    }
    if (!keys[LEFT_ARROW] && !keys[RIGHT_ARROW]) {
      this.velX = 0;  // Stop moving when no key is pressed
    }
    this.x += this.velX;  // Update position based on velocity
    this.x = constrain(this.x, -width / 8, width / 8);  // Keep camel within bounds
  }

  // Function to increase camel's size
  increaseSize() {
    this.sizeMultiplier += 0.1; // Increase size by 10% each time it eats a shawarma
  }
  reset() {
    this.x = 0; // Reset to original position
    this.y = 200; // Reset to original position
    this.sizeMultiplier = 1; // Reset size to the initial value
  }
}


// Obstacle class
class Obstacle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.width = 60; // Increased obstacle size
    this.height = 100; // Increased obstacle size
    this.speed = 6;
  }

  show() {
    push();
    translate(this.x, this.y, 50);
    imageMode(CENTER); // Draw image from the center
    image(redBoxImage, 0, 0, this.width, this.height); // Draw the red box image
    pop();
  }

  move() {
    this.y += this.speed;
  }

  offScreen() {
    return this.y > height / 2;
  }

  hits(camel) {
    if (
      this.x < camel.x + camel.width &&
      this.x + this.width > camel.x &&
      this.y < camel.y + camel.height &&
      this.y + this.height > camel.y
    ) {
      // Reduce health by 25% when hitting an obstacle
      isVibrating = true;
      vibrationTimer = 0; 
      health = max(health - (health * 0.25), 0); // Ensure health doesn't go below 0
      return true;
    }
    return false;
  }
}


// HealthItem class (green boxes)
class HealthItem {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.width = 60; // Increased health item size
    this.height = 60; // Increased health item size
    this.speed = 5;
  }

  show() {
    push();
    translate(this.x, this.y, 50);
    imageMode(CENTER); // Draw image from the center
    image(greenBoxImage, 0, 0, this.width, this.height); // Draw the green box image
    pop();
  }

  move() {
    this.y += this.speed;
  }

  offScreen() {
    return this.y > height / 2;
  }

  hits(camel) {
    if (
      this.x < camel.x + camel.width * camel.sizeMultiplier && // Adjust for camel size multiplier
      this.x + this.width > camel.x &&
      this.y < camel.y + camel.height * camel.sizeMultiplier && // Adjust for camel size multiplier
      this.y + this.height > camel.y
    ) {
      camel.increaseSize(); // Increase camel size when it eats the shawarma
      return true;
    }
    return false;
  }
}

// Portal class
class Portal {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.width = 60;
    this.height = 100;
  }

  show() {
    push();
    translate(this.x, this.y, 50);
    imageMode(CENTER);
    image(portalImage, 0, 0, this.width, this.height); // Draw portal image
    pop();
  }

  hits(camel) {
    return (
      this.x < camel.x + camel.width &&
      this.x + this.width > camel.x &&
      this.y < camel.y + camel.height &&
      this.y + this.height > camel.y
    );
  }
}

// Road class
class Road {
  constructor() {
    this.y = 0;
    this.speed = 6;
    this.width = width * 0.5; // Road width increased to be wider
  }

  show() {
    push();
    translate(0, 0, 0);
    
    fill('#c64c19'); // Adding transparency with alpha value (150)
    beginShape();
    vertex(-this.width / 2, 300, 0);
    vertex(this.width / 2, 300, 0);
    vertex(this.width / 4, -300, 0);
    vertex(-this.width / 4, -300, 0);
    endShape(CLOSE);

    stroke(255);
    strokeWeight(2);

    // Draw lane markings
    for (let i = this.y; i < height / 2; i += 40) {
      line(0, i - 300, 0, i - 280);
    }
    noStroke();
    pop();
  }

  move() {
    this.y += this.speed;
    if (this.y >= 40) {
      this.y = 0;
    }
  }

  reset() {
    this.y = 0;
  }
}


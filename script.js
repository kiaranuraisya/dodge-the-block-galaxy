// debug script to verify canvas & assets
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#001a2b';
ctx.fillRect(0,0,canvas.width,canvas.height);
ctx.fillStyle = '#fff';
ctx.font = '18px sans-serif';
ctx.fillText('canvas is loaded', 20, 40);
console.log('debug: canvas size', canvas.width, canvas.height);

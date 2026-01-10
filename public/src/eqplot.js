

const QUADLEN = 2048;

const textMargin=40;
const leftMargin=35;

const verticalDBRange= 30;

// Interactive state
let interactionState = {
	nodes: [],
	selectedNode: null,
	hoveredNode: null,
	isDragging: false,
	dragStart: null,
	modifierActive: false,
	canvas: null,
	filterObject: null,
	handlers: {},
	debugMode: true, // Enable debug logging and visual overlay
	lastLogTime: 0 // For throttling logs
};

function calculateFilterDataMatrix(type, freq, gain, qfact) {	
	let sampleRate=40000;
	let a0,a1,a2,b1,b2,norm;	
	
	let V = Math.pow(10, Math.abs(gain) / 20);
	let K = Math.tan(Math.PI * freq /sampleRate);
	switch (type) {
		case "one-pole lp":
			b1 = Math.exp(-2.0 * Math.PI * (freq /sampleRate));
			a0 = 1.0 - b1;
			b1 = -b1;
			a1 = a2 = b2 = 0;
			break;

		case "one-pole hp":
			b1 = -Math.exp(-2.0 * Math.PI * (0.5 - freq /sampleRate));
			a0 = 1.0 + b1;
			b1 = -b1;
			a1 = a2 = b2 = 0;
			break;            

		case "Lowpass":
			norm = 1 / (1 + K /qfact + K * K);
			a0 = K * K * norm;
			a1 = 2 * a0;
			a2 = a0;
			b1 = 2 * (K * K - 1) * norm;
			b2 = (1 - K /qfact + K * K) * norm;
			break;
		
		case "Highpass":
			norm = 1 / (1 + K /qfact + K * K);
			a0 = 1 * norm;
			a1 = -2 * a0;
			a2 = a0;
			b1 = 2 * (K * K - 1) * norm;
			b2 = (1 - K /qfact + K * K) * norm;
			break;
		
		case "Bandpass":
			norm = 1 / (1 + K /qfact + K * K);
			a0 = K /qfact * norm;
			a1 = 0;
			a2 = -a0;
			b1 = 2 * (K * K - 1) * norm;
			b2 = (1 - K /qfact + K * K) * norm;
			break;
		
		case "Notch":
			norm = 1 / (1 + K /qfact + K * K);
			a0 = (1 + K * K) * norm;
			a1 = 2 * (K * K - 1) * norm;
			a2 = a0;
			b1 = a1;
			b2 = (1 - K /qfact + K * K) * norm;
			break;
		
		case "Peaking":
			if (gain >= 0) {
				norm = 1 / (1 + 1/qfact * K + K * K);
				a0 = (1 + V/qfact * K + K * K) * norm;
				a1 = 2 * (K * K - 1) * norm;
				a2 = (1 - V/qfact * K + K * K) * norm;
				b1 = a1;
				b2 = (1 - 1/qfact * K + K * K) * norm;
			}
			else {	
				norm = 1 / (1 + V/qfact * K + K * K);
				a0 = (1 + 1/qfact * K + K * K) * norm;
				a1 = 2 * (K * K - 1) * norm;
				a2 = (1 - 1/qfact * K + K * K) * norm;
				b1 = a1;
				b2 = (1 - V/qfact * K + K * K) * norm;
			}
			break;

		case "Lowshelf":
			if (gain >= 0) {
				norm = 1 / (1 + Math.SQRT2 * K + K * K);
				a0 = (1 + Math.sqrt(2*V) * K + V * K * K) * norm;
				a1 = 2 * (V * K * K - 1) * norm;
				a2 = (1 - Math.sqrt(2*V) * K + V * K * K) * norm;
				b1 = 2 * (K * K - 1) * norm;
				b2 = (1 - Math.SQRT2 * K + K * K) * norm;
			}
			else {	
				norm = 1 / (1 + Math.sqrt(2*V) * K + V * K * K);
				a0 = (1 + Math.SQRT2 * K + K * K) * norm;
				a1 = 2 * (K * K - 1) * norm;
				a2 = (1 - Math.SQRT2 * K + K * K) * norm;
				b1 = 2 * (V * K * K - 1) * norm;
				b2 = (1 - Math.sqrt(2*V) * K + V * K * K) * norm;
			}
			break;

		case "Highshelf":
			if (gain >= 0) {
				norm = 1 / (1 + Math.SQRT2 * K + K * K);
				a0 = (V + Math.sqrt(2*V) * K + K * K) * norm;
				a1 = 2 * (K * K - V) * norm;
				a2 = (V - Math.sqrt(2*V) * K + K * K) * norm;
				b1 = 2 * (K * K - 1) * norm;
				b2 = (1 - Math.SQRT2 * K + K * K) * norm;
			}
			else {	
				norm = 1 / (V + Math.sqrt(2*V) * K + K * K);
				a0 = (1 + Math.SQRT2 * K + K * K) * norm;
				a1 = 2 * (K * K - 1) * norm;
				a2 = (1 - Math.SQRT2 * K + K * K) * norm;
				b1 = 2 * (K * K - V) * norm;
				b2 = (V - Math.sqrt(2*V) * K + K * K) * norm;
			}
			break;
	}

	let len = QUADLEN;
	let magPlot = [];
	for (let idx = 0; idx < len; idx++) {
		let w;
		w = Math.exp(Math.log(1 / 0.001) * idx / (len - 1)) * 0.001 * Math.PI;	// 0.001 to 1, times pi, log scale
		let phi = Math.pow(Math.sin(w/2), 2);
		let y = Math.log(Math.pow(a0+a1+a2, 2) - 4*(a0*a1 + 4*a0*a2 + a1*a2)*phi + 16*a0*a2*phi*phi) - Math.log(Math.pow(1+b1+b2, 2) - 4*(b1 + 4*b2 + b1*b2)*phi + 16*b2*phi*phi);
		y = y * 10 / Math.LN10
		if (y == -Infinity) y = -200;		
		magPlot.push([ idx / (len - 1) / 2, y]);		
	}
	return magPlot;
	
}

function plotArray(canvas, array, col, lineWidth){       
	let ctx = canvas.getContext("2d");
	let h = canvas.height;    
	let w = canvas.width;    
	let ch = h / 2; 
	let x,y;


	ctx.beginPath();			
	ctx.strokeStyle = col;        
	ctx.lineWidth = lineWidth;
	ctx.setLineDash([]);

	let stepSize = (w - textMargin) / (array.length + 1 );
	const heightScale= 16.5; 
	
	for (let i=0;i<array.length;i++) {            		
		x=  textMargin + i * stepSize;								
		y = ch-(heightScale* array[i][1]);
		ctx.lineTo(x,y);				
	}        
	ctx.stroke();               
	return {"color":col,"lineWidth":lineWidth};	
}

function createGridEx(canvas) {
	let ctx = canvas.getContext("2d");

	let h = canvas.height;	
	let w = canvas.width;    		

	let verticalLineCount= 30;        	
	let verticalStepSize = h /verticalLineCount -1

	ctx.font="14px Abel";
	ctx.fillStyle = "#EEE";  	
	ctx.strokeStyle = "#CCC";        
	ctx.lineWidth = 0.5;
	ctx.setLineDash([1,5])
	

	ctx.beginPath();
	for (let i=1;i<verticalLineCount;i+=2) {    		
		ctx.moveTo(60,verticalStepSize * i);
		ctx.lineTo(w-10,verticalStepSize * i) 
		let level = (i + verticalLineCount/2 - verticalLineCount)*-1;
		ctx.fillText(level+"dB", 10 ,verticalStepSize * i)		
	}   
	ctx.stroke();     	
			
	ctx.beginPath();
	let xPos;
	const freqList = [[30,28],[40, 71],[50, 104],[60, 131],[70, 154],[80, 174],[90, 191],[100, 207],[200, 309],[300, 369],[400, 412],[500, 445],[600, 472],[700, 495],[800, 515],[900, 532],[1000, 548],[2000, 650],[3000, 711],[4000, 753],[5000, 786],[6000, 814],[7000, 837],[8000, 857],[9000, 874],[10000, 890],[11000, 904],[12000, 918],[13000, 930],[14000, 941],[15000, 951],[16000, 961],[17000, 971],[18000, 979],[19000, 988],[20000, 996]]
	for (let i=0;i<freqList.length;i++) {		
	
		xPos= 35+freqList[i][1];
		switch(freqList[i][0]) {
			case 100:
			case 1000:
			case 10000:
				ctx.fillText(freqList[i][0]+"Hz", xPos-15, h-25);				
		}		
		ctx.moveTo(xPos,18);
		ctx.lineTo(xPos,h-50);						
	}
	ctx.stroke();
	
	ctx.strokeStyle = "#DDD";        
	ctx.lineWidth = 0.8;
	ctx.setLineDash([2,5]);
	
	ctx.beginPath();
	ctx.moveTo(35 + 207,18);
	ctx.lineTo(35 + 207,h-50);		

	ctx.moveTo(35 + 548,18);
	ctx.lineTo(35 + 548,h-50);		

	ctx.moveTo(35 + 890,18);
	ctx.lineTo(35 + 890,h-50);		

	ctx.stroke();
	
}

function createGrid(canvas) {
	let ctx = canvas.getContext("2d");
	
	const height = canvas.height - textMargin;
	const width = canvas.width - textMargin;    		
	  	
	let verticalStepSize = (height + textMargin) /verticalDBRange;

	ctx.font="14px Abel";
	ctx.fillStyle = "#DDD";  	
	ctx.strokeStyle = "#CCC";        
	ctx.lineWidth = 0.5;
	ctx.setLineDash([1,5])
	
	// Vertical lines and level scale
	ctx.beginPath();
	for (let i=1;i<verticalDBRange;i+=2) {    		

		ctx.moveTo(textMargin,verticalStepSize * i);
		ctx.lineTo(width + textMargin,verticalStepSize * i) 
		let level = (i + verticalDBRange/2 - verticalDBRange)*-1;
		ctx.fillText(level+"dB", 0 ,verticalStepSize * i)		
	}   
	ctx.stroke();     	
			
	// Horizontal lines and frequency scale
	ctx.beginPath();
	let xPos;
	const freqList = [[20,4],[30,65],[40, 107],[50, 140],[60, 167],[70, 190],[80, 209],[90, 227],[100, 243]
					,[200, 345],[300, 406],[400, 448],[500, 482],[600, 509],[700, 531],[800, 551],[900, 569],[1000, 584]
					,[2000, 686],[3000, 746],[4000, 789],[5000, 822],[6000, 849],[7000, 872],[8000, 891],[9000, 909],[10000, 925]
					,[11000, 939],[12000, 952],[13000, 964],[14000, 974],[15000, 985],[16000, 994],[17000, 1003],[18000, 1012],[19000, 1020]]
	for (let i=0;i<freqList.length;i++) {				
		xPos= leftMargin+(freqList[i][1]/1024*width);
		// xPos= 35+freqList[i][1]

		switch(freqList[i][0]) {
			case 100:
			case 1000:
			case 10000:
				ctx.fillText(new Intl.NumberFormat("en-US").format(freqList[i][0]) +"Hz", xPos-20, height+textMargin);				
		}		
		ctx.moveTo(xPos,16);
		ctx.lineTo(xPos,height+24);						
	}
	ctx.stroke();
	
	// // Horizontal lines at 100, 1,000 and 10,000Hz
	ctx.strokeStyle = "#DDD";
	ctx.lineWidth = 0.8;
	ctx.setLineDash([3,5]);
	
	ctx.beginPath();
	ctx.moveTo(leftMargin + (243/1024*width),16);
	ctx.lineTo(leftMargin + (243/1024*width),height+24);		

	ctx.moveTo(leftMargin + (584/1024*width),16);
	ctx.lineTo(leftMargin + (584/1024*width),height+24);		

	ctx.moveTo(leftMargin + (925/1024*width),16);
	ctx.lineTo(leftMargin + (925/1024*width),height+24);		

	ctx.stroke();
	
}

function plot(filterObject, canvas, name, color) {
	const ctx = canvas;        
	const context = ctx.getContext('2d');             
	let newColor;
	if (color!=undefined) newColor = color.toString(16); else newColor="6688BB"
	// console.log("Color ",newColor)

	// Clear the canvas	
	// context.clearRect(0, 0, ctx.width, ctx.height);        	
	

	// Create the grid
	createGrid(ctx); 
	
	canvas.totalArray = plotFilters(Object.keys(filterObject),ctx,color);

	function plotFilters(filters, ctx, color) {
		let totalArray = new Array(QUADLEN).fill(0).map(() => new Array(QUADLEN).fill(0));
		let dataMatrix=[];	
		let filterNum=0;
		for (let filter of filters) {  
			// if (filterObject[filter].type=="Gain") continue;
			
			if (filterObject[filter].type!="Biquad") continue;
			if (filterObject[filter].parameters.type!="Peaking" && filterObject[filter].parameters.type!="Highshelf" && filterObject[filter].parameters.type!="Lowshelf") continue;
	
			dataMatrix = calculateFilterDataMatrix(filterObject[filter].parameters.type, filterObject[filter].parameters.freq, filterObject[filter].parameters.gain, filterObject[filter].parameters.q);                        
			for (let i=0;i<dataMatrix.length;i++) {
				totalArray[i][0]=dataMatrix[i][0]
				totalArray[i][1]=dataMatrix[i][1]+totalArray[i][1];        
			}
			let newColor = colorChange(color,filterNum)						
			plotArray(ctx,dataMatrix,"#"+newColor,0.5);		
			filterNum++;
			
		}
		
		let t= plotArray(ctx, totalArray,"#FFF",2.5);					
		return totalArray;
	}


	// Centre and print the config name 
	if (name!=undefined) {
		context.font="16px Abel";            
		context.fillStyle="#FFF";
		const nameText = " "+name+" "
		const textWidth = context.measureText(nameText).width;
		const nameLeft = (canvas.width - textWidth)/2;
		context.fillText(nameText,nameLeft,12);            
	}

	let max = Math.round(Math.max(...canvas.totalArray[1]));
	// console.log("Max ",max);
	return max;
}

function colorChange(startColor,colorIndex) {
	let colorText;
	if (typeof(startColor)=="number") colorText = startColor.toString(16); else colorText=startColor;

	let red = parseInt(colorText.substring(0,2),16);
	let green = parseInt(colorText.substring(2,4),16);
	let blue = parseInt(colorText.substring(4),16);
	
    // console.log("Color Text :",colorText,"\tR:",red,"G:",green,"B:",blue);
	red  = (red + 1 * colorIndex) % 255;
	green = (green + 4 * colorIndex) % 255;
	blue = (blue + 2 * colorIndex) % 255;

	let changedColor = (red+green*255+blue*255*255).toString(16);
	// console.log("New color #",colorIndex,":",changedColor)
	return changedColor;
	
}

// ========== COORDINATE TRANSFORM FUNCTIONS ==========

// Frequency to X coordinate (log scale)
function freqToX(freq, canvas) {
	const width = canvas.width - textMargin;
	// Using log scale: normalize frequency between 20Hz and 20000Hz
	const minFreq = 20;
	const maxFreq = 20000;
	
	// Clamp frequency
	freq = Math.max(minFreq, Math.min(maxFreq, freq));
	
	// Log scale mapping
	const logMin = Math.log(minFreq);
	const logMax = Math.log(maxFreq);
	const logFreq = Math.log(freq);
	
	const normalized = (logFreq - logMin) / (logMax - logMin);
	return leftMargin + (normalized * width);
}

// X coordinate to frequency (inverse of freqToX)
function xToFreq(x, canvas) {
	const width = canvas.width - textMargin;
	const minFreq = 20;
	const maxFreq = 20000;
	
	// Normalize x position
	const normalized = Math.max(0, Math.min(1, (x - leftMargin) / width));
	
	// Inverse log scale
	const logMin = Math.log(minFreq);
	const logMax = Math.log(maxFreq);
	const logFreq = logMin + normalized * (logMax - logMin);
	
	const freq = Math.exp(logFreq);
	return Math.max(minFreq, Math.min(maxFreq, freq));
}

// Gain (dB) to Y coordinate
function dbToY(db, canvas) {
	const height = canvas.height - textMargin;
	const ch = canvas.height / 2;
	const heightScale = 16.5;
	
	return ch - (heightScale * db);
}

// Y coordinate to gain (dB)
function yToDb(y, canvas) {
	const ch = canvas.height / 2;
	const heightScale = 16.5;
	
	const db = (ch - y) / heightScale;
	
	// Clamp to reasonable range
	return Math.max(-24, Math.min(24, db));
}

// ========== NODE INDEX & HIT TESTING ==========

function buildNodeIndex(filterObject, canvas, color) {
	console.debug(`=== buildNodeIndex called ===`);
	console.debug(`Canvas dimensions: ${canvas.width}x${canvas.height}`);
	console.debug(`Canvas rect:`, canvas.getBoundingClientRect());
	console.debug(`Color:`, color);
	console.debug(`Filter object keys:`, Object.keys(filterObject || {}));
	
	const nodes = [];
	
	if (!filterObject) {
		console.debug("No filterObject provided");
		return nodes;
	}
	
	let filterNum = 0;
	for (let filterName of Object.keys(filterObject)) {
		const filter = filterObject[filterName];
		
		console.debug(`Checking filter: ${filterName}, type: ${filter.type}`);
		
		// Only index Biquad filters with Peaking, Highshelf, or Lowshelf types
		if (filter.type !== "Biquad") continue;
		const subType = filter.parameters.type;
		if (subType !== "Peaking" && subType !== "Highshelf" && subType !== "Lowshelf") continue;
		
		const freq = filter.parameters.freq;
		const gain = filter.parameters.gain;
		const q = filter.parameters.q;
		
		const x = freqToX(freq, canvas);
		const y = dbToY(gain, canvas);
		
		// Calculate node color
		let nodeColor = colorChange(color, filterNum);
		
		const node = {
			name: filterName,
			freq: freq,
			gain: gain,
			q: q,
			x: x,
			y: y,
			color: "#" + nodeColor,
			type: subType
		};
		
		nodes.push(node);
		console.debug(`Added node: ${filterName} at (${x.toFixed(1)}, ${y.toFixed(1)}) - ${freq}Hz ${gain}dB Q${q}`);
		
		filterNum++;
	}
	
	console.debug(`Built node index with ${nodes.length} nodes`);
	if (nodes.length > 0) {
		console.debug("Sample nodes:", nodes.slice(0, 3));
	}
	return nodes;
}

function hitTest(x, y, canvas) {
	const hitRadius = 12; // Hit radius in pixels
	const nodes = interactionState.nodes;
	
	// Test nodes in reverse order (last drawn = on top)
	for (let i = nodes.length - 1; i >= 0; i--) {
		const node = nodes[i];
		const dx = x - node.x;
		const dy = y - node.y;
		const distance = Math.sqrt(dx * dx + dy * dy);
		
		if (distance <= hitRadius) {
			console.debug(`Hit test: found node ${node.name} at distance ${distance.toFixed(2)}px`);
			return node;
		}
	}
	
	return null;
}

// ========== NODE RENDERING ==========

function drawNodes(canvas, selectedNodeName, hoveredNodeName) {
	const ctx = canvas.getContext("2d");
	const nodes = interactionState.nodes;
	
	nodes.forEach(node => {
		const isSelected = node.name === selectedNodeName;
		const isHovered = node.name === hoveredNodeName;
		
		// Draw node
		ctx.beginPath();
		ctx.arc(node.x, node.y, isSelected ? 8 : 6, 0, 2 * Math.PI);
		
		// Fill
		ctx.fillStyle = node.color;
		ctx.fill();
		
		// Stroke
		if (isSelected) {
			ctx.strokeStyle = "#FFF";
			ctx.lineWidth = 3;
			ctx.stroke();
		} else if (isHovered) {
			ctx.strokeStyle = "#FFF";
			ctx.lineWidth = 2;
			ctx.stroke();
		} else {
			ctx.strokeStyle = "#000";
			ctx.lineWidth = 1.5;
			ctx.stroke();
		}
	});
}

function drawOverlay(canvas, selectedNodeName, hoveredNodeName) {
	console.debug(`=== drawOverlay called ===`);
	console.debug(`Nodes count: ${interactionState.nodes.length}`);
	console.debug(`Selected: ${selectedNodeName}, Hovered: ${hoveredNodeName}`);
	
	drawNodes(canvas, selectedNodeName, hoveredNodeName);
	
	// Draw info overlay if hovering or selected
	const activeNodeName = hoveredNodeName || selectedNodeName;
	if (activeNodeName) {
		const node = interactionState.nodes.find(n => n.name === activeNodeName);
		if (node) {
			drawInfoOverlay(canvas, node);
		}
	}
	
	// Debug mode: draw larger, more visible nodes
	if (interactionState.debugMode && interactionState.nodes.length > 0) {
		const ctx = canvas.getContext("2d");
		ctx.save();
		interactionState.nodes.forEach((node, idx) => {
			// Draw large contrasting circle (magenta)
			ctx.beginPath();
			ctx.arc(node.x, node.y, 13, 0, 2 * Math.PI);
			ctx.fillStyle = "rgba(255, 0, 255, 0.3)"; // Semi-transparent magenta
			ctx.fill();
			ctx.strokeStyle = "#FF00FF"; // Bright magenta
			ctx.lineWidth = 4;
			ctx.stroke();
			
			// Draw center dot (white)
			ctx.beginPath();
			ctx.arc(node.x, node.y, 3, 0, 2 * Math.PI);
			ctx.fillStyle = "#FFF";
			ctx.fill();
			ctx.strokeStyle = "#000";
			ctx.lineWidth = 1;
			ctx.stroke();
			
			// Draw label with background
			const labelText = `${idx}:${node.freq}Hz`;
			ctx.font = "11px monospace";
			const textMetrics = ctx.measureText(labelText);
			const textX = node.x + 15;
			const textY = node.y + 4;
			
			// Background rectangle for readability
			ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
			ctx.fillRect(textX - 2, textY - 10, textMetrics.width + 4, 14);
			
			// Text
			ctx.fillStyle = "#0F0"; // Bright green text
			ctx.fillText(labelText, textX, textY);
		});
		ctx.restore();
		console.debug("Debug overlay drawn with high-contrast nodes");
	}
}

function drawInfoOverlay(canvas, node) {
	const ctx = canvas.getContext("2d");
	
	// Format values
	const freqText = node.freq < 1000 
		? `${Math.round(node.freq)} Hz` 
		: `${(node.freq / 1000).toFixed(2)} kHz`;
	const gainText = `${node.gain.toFixed(1)} dB`;
	const qText = `Q: ${node.q.toFixed(2)}`;
	
	const text = `${freqText} | ${gainText} | ${qText}`;
	
	// Position overlay near node
	const padding = 8;
	const offsetY = -25;
	
	ctx.font = "13px Abel";
	const metrics = ctx.measureText(text);
	const textWidth = metrics.width;
	const textHeight = 16;
	
	let boxX = node.x - textWidth / 2 - padding;
	let boxY = node.y + offsetY - textHeight - padding;
	
	// Keep overlay within canvas bounds
	boxX = Math.max(5, Math.min(canvas.width - textWidth - padding * 2 - 5, boxX));
	boxY = Math.max(5, boxY);
	
	// Draw background
	ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
	ctx.fillRect(boxX, boxY, textWidth + padding * 2, textHeight + padding * 2);
	
	// Draw border
	ctx.strokeStyle = node.color;
	ctx.lineWidth = 2;
	ctx.strokeRect(boxX, boxY, textWidth + padding * 2, textHeight + padding * 2);
	
	// Draw text
	ctx.fillStyle = "#FFF";
	ctx.fillText(text, boxX + padding, boxY + textHeight + padding / 2);
}

// ========== INTERACTION HANDLERS ==========

function initInteraction(canvas, handlers) {
	console.debug("Initializing interactive EQ graph");
	
	interactionState.canvas = canvas;
	interactionState.handlers = handlers || {};
	
	// Make canvas focusable
	canvas.setAttribute('tabindex', '0');
	canvas.style.cursor = 'crosshair';
	
	// Mouse events
	canvas.addEventListener('mousedown', onMouseDown);
	canvas.addEventListener('mousemove', onMouseMove);
	canvas.addEventListener('mouseup', onMouseUp);
	canvas.addEventListener('mouseleave', onMouseLeave);
	canvas.addEventListener('wheel', onWheel, { passive: false });
	
	// Keyboard events
	canvas.addEventListener('keydown', onKeyDown);
	canvas.addEventListener('keyup', onKeyUp);
	
	console.debug("Interactive EQ graph initialized");
}

function getCanvasMousePos(canvas, evt) {
	const rect = canvas.getBoundingClientRect();
	return {
		x: evt.clientX - rect.left,
		y: evt.clientY - rect.top
	};
}

function onMouseDown(evt) {
	const canvas = interactionState.canvas;
	const pos = getCanvasMousePos(canvas, evt);
	
	const hitNode = hitTest(pos.x, pos.y, canvas);
	
	if (hitNode) {
		console.debug(`Mouse down on node: ${hitNode.name}`);
		interactionState.isDragging = true;
		interactionState.selectedNode = hitNode;
		interactionState.dragStart = { x: pos.x, y: pos.y, freq: hitNode.freq, gain: hitNode.gain, q: hitNode.q };
		
		// Notify selection
		if (interactionState.handlers.onSelect) {
			interactionState.handlers.onSelect(hitNode.name);
		}
		
		canvas.style.cursor = 'grabbing';
		evt.preventDefault();
	} else {
		// Deselect
		interactionState.selectedNode = null;
		if (interactionState.handlers.onDeselect) {
			interactionState.handlers.onDeselect();
		}
	}
}

function onMouseMove(evt) {
	const canvas = interactionState.canvas;
	const pos = getCanvasMousePos(canvas, evt);
	
	if (interactionState.isDragging && interactionState.selectedNode && interactionState.dragStart) {
		// Dragging
		const node = interactionState.selectedNode;
		const isShiftPressed = evt.shiftKey;
		
		if (isShiftPressed) {
			// Shift + drag: modify Q
			const deltaY = interactionState.dragStart.y - pos.y;
			const qChange = deltaY * 0.01; // Sensitivity
			const newQ = Math.max(0.1, Math.min(20, interactionState.dragStart.q + qChange));
			
			if (interactionState.handlers.onDrag) {
				interactionState.handlers.onDrag(node.name, node.freq, node.gain, newQ);
			}
		} else {
			// Normal drag: modify frequency and gain
			const newFreq = xToFreq(pos.x, canvas);
			const newGain = yToDb(pos.y, canvas);
			
			if (interactionState.handlers.onDrag) {
				interactionState.handlers.onDrag(node.name, newFreq, newGain, node.q);
			}
		}
		
		evt.preventDefault();
	} else {
		// Hovering
		const hitNode = hitTest(pos.x, pos.y, canvas);
		
		if (hitNode) {
			interactionState.hoveredNode = hitNode;
			canvas.style.cursor = 'pointer'; // More visible cursor
			console.debug(`Hovering over node: ${hitNode.name}`);
		} else {
			interactionState.hoveredNode = null;
			canvas.style.cursor = 'crosshair';
		}
		
		// Request overlay redraw
		if (interactionState.handlers.onHover) {
			interactionState.handlers.onHover(hitNode ? hitNode.name : null);
		}
	}
}

function onMouseUp(evt) {
	if (interactionState.isDragging) {
		console.debug(`Mouse up, ending drag of ${interactionState.selectedNode?.name}`);
		
		if (interactionState.handlers.onDragEnd) {
			interactionState.handlers.onDragEnd();
		}
		
		interactionState.isDragging = false;
		interactionState.dragStart = null;
		interactionState.canvas.style.cursor = 'grab';
	}
}

function onMouseLeave(evt) {
	if (interactionState.isDragging) {
		onMouseUp(evt);
	}
	interactionState.hoveredNode = null;
	if (interactionState.handlers.onHover) {
		interactionState.handlers.onHover(null);
	}
}

function onWheel(evt) {
	const canvas = interactionState.canvas;
	const pos = getCanvasMousePos(canvas, evt);
	
	const hitNode = hitTest(pos.x, pos.y, canvas);
	
	if (hitNode) {
		// Modify Q with wheel
		const delta = -Math.sign(evt.deltaY);
		const qChange = delta * 0.1;
		const newQ = Math.max(0.1, Math.min(20, hitNode.q + qChange));
		
		console.debug(`Wheel on ${hitNode.name}: Q ${hitNode.q.toFixed(2)} -> ${newQ.toFixed(2)}`);
		
		if (interactionState.handlers.onDrag) {
			interactionState.handlers.onDrag(hitNode.name, hitNode.freq, hitNode.gain, newQ);
		}
		
		if (interactionState.handlers.onDragEnd) {
			interactionState.handlers.onDragEnd();
		}
		
		evt.preventDefault();
	}
}

function onKeyDown(evt) {
	if (!interactionState.selectedNode) return;
	
	const node = interactionState.selectedNode;
	let newFreq = node.freq;
	let newGain = node.gain;
	let changed = false;
	
	switch (evt.key) {
		case 'ArrowUp':
			newGain = Math.min(24, node.gain + 0.1);
			changed = true;
			break;
		case 'ArrowDown':
			newGain = Math.max(-24, node.gain - 0.1);
			changed = true;
			break;
		case 'ArrowLeft':
			newFreq = Math.max(20, node.freq * 0.99);
			changed = true;
			break;
		case 'ArrowRight':
			newFreq = Math.min(20000, node.freq * 1.01);
			changed = true;
			break;
		case 'Escape':
			interactionState.selectedNode = null;
			if (interactionState.handlers.onDeselect) {
				interactionState.handlers.onDeselect();
			}
			return;
	}
	
	if (changed) {
		console.debug(`Keyboard adjustment: ${node.name} freq=${newFreq.toFixed(0)} gain=${newGain.toFixed(1)}`);
		
		if (interactionState.handlers.onDrag) {
			interactionState.handlers.onDrag(node.name, newFreq, newGain, node.q);
		}
		
		if (interactionState.handlers.onDragEnd) {
			interactionState.handlers.onDragEnd();
		}
		
		evt.preventDefault();
	}
}

function onKeyUp(evt) {
	// Future: handle modifier key releases if needed
}

// ========== PUBLIC API ==========

function setSelectedNode(nodeName) {
	const node = interactionState.nodes.find(n => n.name === nodeName);
	if (node) {
		interactionState.selectedNode = node;
		console.debug(`Selected node: ${nodeName}`);
	} else {
		interactionState.selectedNode = null;
		console.debug(`Deselected node`);
	}
}

function updateNodeIndex(filterObject, canvas, color) {
	interactionState.filterObject = filterObject;
	interactionState.nodes = buildNodeIndex(filterObject, canvas, color);
}

export default plot;
export { initInteraction, drawOverlay, setSelectedNode, updateNodeIndex };

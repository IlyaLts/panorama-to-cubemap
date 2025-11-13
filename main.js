const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

class RadioInput {
  constructor(name, onChange) {
    this.inputs = document.querySelectorAll(`input[name=${name}]`);
    for (let input of this.inputs) {
      input.addEventListener('change', onChange);
    }
  }

  get value() {
    for (let input of this.inputs) {
      if (input.checked) {
        return input.value;
      }
    }
  }
}

class Input {
  constructor(id, onChange) {
    this.input = document.getElementById(id);
    this.input.addEventListener('change', onChange);
    this.valueAttrib = this.input.type === 'checkbox' ? 'checked' : 'value';
  }

  get value() {
    return this.input[this.valueAttrib];
  }
}

class CubeFace {
  constructor(faceName, name) {
    this.faceName = faceName;
    this.name = name;

    this.anchor = document.createElement('a');
    this.anchor.style.position='absolute';
    this.anchor.title = name;

    this.img = document.createElement('img');
    this.img.style.filter = 'blur(4px)';

    this.anchor.appendChild(this.img);
  }

  setPreview(url, x, y) {
    this.img.src = url;
    this.anchor.style.left = `${x}px`;
    this.anchor.style.top = `${y}px`;
  }

  setDownload(url, fileExtension) {
	this.anchor.href = url;
    this.anchor.download = `${this.name}.${fileExtension}`;
    this.img.style.filter = '';
  }
}

function removeChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

const mimeType = {
  'jpg': 'image/jpeg',
  'png': 'image/png',
  'tga': 'image/tga'
};

function getDataURL(imgData, extension) {
  if (extension === 'tga') {
    let tgaArrayBuffer;
	const origin = settings.origin.value;

    if (settings.compression.value === 'rle') {
	  tgaArrayBuffer = encodeTGA_RLE(imgData.data, imgData.width, imgData.height, origin);
	}
	else {
	  tgaArrayBuffer = encodeTGA(imgData.data, imgData.width, imgData.height, origin); 
	}
	
    let blob = new Blob([tgaArrayBuffer], { type: mimeType.tga });
    return new Promise(resolve => {resolve(URL.createObjectURL(blob));});
  }
  else {
    canvas.width = imgData.width;
    canvas.height = imgData.height;
    ctx.putImageData(imgData, 0, 0);
	  
    return new Promise(resolve => {
    canvas.toBlob(blob => resolve(URL.createObjectURL(blob)), mimeType[extension], 0.92);
    });
  }
}

const dom = {
  imageInput: document.getElementById('imageInput'),
  faces: document.getElementById('faces'),
  generating: document.getElementById('generating'),
  save: document.getElementById('save'),
  saveInfo: document.getElementById('save-info'),
  compressionField: document.getElementById('compression-field'),
  originField: document.getElementById('origin-field'),
};

function saveImages() {
  for (const child of dom.faces.children) {
    child.click();
  };
};

dom.save.addEventListener('click', saveImages);
dom.imageInput.addEventListener('change', loadImage);
  
const settings = {
  cubeRotation: new Input('cubeRotation', loadImage),
  interpolation: new RadioInput('interpolation', loadImage),
  format: new RadioInput('format', loadImage),
  size: new RadioInput('size', loadImage),
  compression: new RadioInput('compression', loadImage),
  origin: new RadioInput('origin', loadImage),
};

const facePositions = {
  pz: {x: 1, y: 1, name: 'Front'},
  nz: {x: 3, y: 1, name: 'Back'},
  px: {x: 2, y: 1, name: 'Right'},
  nx: {x: 0, y: 1, name: 'Left'},
  py: {x: 1, y: 0, name: 'Top'},
  ny: {x: 1, y: 2, name: 'Bottom'}
};

function loadImage() {
  const file = dom.imageInput.files[0];
  
  dom.compressionField.hidden = !(settings.format.value === 'tga');
  dom.originField.hidden = !(settings.format.value === 'tga');

  if (!file) {
    return;
  }

  const img = new Image();

  img.src = URL.createObjectURL(file);

  img.addEventListener('load', () => {
    const {width, height} = img;
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, width, height);

    processImage(data);
  });
}

let finished = 0;
let workers = [];

function processImage(data) {
  removeChildren(dom.faces);
  dom.generating.style.visibility = 'visible';
  dom.saveInfo.disabled = true;

  for (let worker of workers) {
    worker.terminate();
  }

  for (let [faceName, position] of Object.entries(facePositions)) {
    renderFace(data, faceName, position, position.name);
  }
}

function renderFace(data, faceName, position, name) {
  const face = new CubeFace(faceName, name);
  dom.faces.appendChild(face.anchor);

  const options = {
    data: data,
    face: faceName,
    rotation: Math.PI * settings.cubeRotation.value / 180,
    interpolation: settings.interpolation.value,
	size: settings.size.value,
	compression: settings.compression.value,
	origin: settings.origin.value,
  };

  const worker = new Worker('convert.js');

  const setDownload = ({data: imageData}) => {
    const extension = settings.format.value;
	
    getDataURL(imageData, extension)
      .then(url => face.setDownload(url, extension));

    finished++;

    if (finished === 6) {
      dom.generating.style.visibility = 'hidden';
	  dom.saveInfo.disabled = false;  
      finished = 0;
      workers = [];
    }
  };

  const setPreview = ({data: imageData}) => {
    const x = imageData.width * position.x;
    const y = imageData.height * position.y;

    getDataURL(imageData, 'jpg')
      .then(url => face.setPreview(url, x, y));

    worker.onmessage = setDownload;
    worker.postMessage(options);
  };

  worker.onmessage = setPreview;
  worker.postMessage(Object.assign({}, options, {
    maxWidth: 200,
    interpolation: 'linear',
  }));

  workers.push(worker);
}

function encodeTGA(data, width, height, origin) {
  const HEADER_SIZE = 18;
  const PIXEL_DATA_SIZE = width * height * 3; 
  const buffer = new ArrayBuffer(HEADER_SIZE + PIXEL_DATA_SIZE);
  const view = new DataView(buffer);
  let offset = 0;

  // ID length
  view.setUint8(offset, 0);
  offset++;
  
  // Color map type
  view.setUint8(offset, 0);
  offset++;
  
  // Image type
  view.setUint8(offset, 2);
  offset++;
  
  // First entry index
  view.setUint16(offset, 0, true);
  offset += 2;
	
  // Color map length
  view.setUint16(offset, 0, true);
  offset += 2;
	
  // Color map entry
  view.setUint8(offset, 0);
	offset++;

  // X-origin
  view.setUint16(offset, 0, true); 
  offset += 2;
	
  // Y-origin
  view.setUint16(offset, 0, true);
  offset += 2;

  // Width
  view.setUint16(offset, width, true); 
  offset += 2;
	
  // Height
  view.setUint16(offset, height, true); 
  offset += 2;

  // Bit Depth
  view.setUint8(offset, 24);
  offset++; 
  
  // Image Descriptor (vh flip bits)
  view.setUint8(offset, origin === 'bottom-left' ? 0 : 0x20); 
  offset++; 

  // RGB to BGR
  if (origin === 'bottom-left')
  {
    for (let y = height - 1; y >= 0; y--) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4; 

        view.setUint8(offset, data[index + 2]);      // B
        view.setUint8(offset + 1, data[index + 1]);  // G
        view.setUint8(offset + 2, data[index]);      // R
        offset += 3;  
      }
    }
  }
  else
  {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;

        view.setUint8(offset, data[index + 2]);       // B
        view.setUint8(offset + 1, data[index + 1]);   // G
        view.setUint8(offset + 2, data[index]);       // R
	    offset += 3; 
      }
    }
  }
  
  return buffer;
}

function encodeTGA_RLE(data, width, height, origin) {
  const HEADER_SIZE = 18;
  const PIXEL_BYTES = 3;
  const bgrData = new Uint8Array(width * height * PIXEL_BYTES);
  let bgrIndex = 0;
  
  // RGB to BGR
  if (origin === 'bottom-left')
  {
    for (let y = height - 1; y >= 0; y--) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;

        bgrData[bgrIndex] = data[index + 2];      // B
        bgrData[bgrIndex + 1] = data[index + 1];  // G
        bgrData[bgrIndex + 2] = data[index];      // R
        bgrIndex += 3;  
      }
    }
  }
  else
  {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;

        bgrData[bgrIndex] = data[index + 2];      // B
        bgrData[bgrIndex + 1] = data[index + 1];  // G
        bgrData[bgrIndex + 2] = data[index];      // R
	    bgrIndex += 3; 
      }
    }
  }

  const compressedChunks = [];
  let compressedSize = 0;
  let i = 0;
  const totalPixels = width * height;

  while (i < totalPixels) {
    const p_b = bgrData[i * PIXEL_BYTES];
    const p_g = bgrData[i * PIXEL_BYTES + 1];
    const p_r = bgrData[i * PIXEL_BYTES + 2];
    
    // Finds the length of the RLE
	let j = i + 1;
    while (j < totalPixels) {
      const next_b = bgrData[j * PIXEL_BYTES];
      const next_g = bgrData[j * PIXEL_BYTES + 1];
      const next_r = bgrData[j * PIXEL_BYTES + 2];
      
      if (p_b === next_b && p_g === next_g && p_r === next_r) {
        j++;
      } else {
        break;
      }
    }

    const rleLength = j - i;
    const rleMax = 128; 
    
	// RLE
    if (rleLength >= 2) {
      let rleCurrent = Math.min(rleLength, rleMax);

      compressedChunks.push((1 << 7) | (rleCurrent - 1));
      compressedChunks.push(p_b, p_g, p_r);
      compressedSize += 1 + PIXEL_BYTES;

      i += rleCurrent;
    }
	// Raw
	else {
      let rawEnd = j;
      
      while (rawEnd < totalPixels && (rawEnd - i) < rleMax) {
        if (rawEnd + 1 < totalPixels) {
          const k_b = bgrData[rawEnd * PIXEL_BYTES];
          const k_g = bgrData[rawEnd * PIXEL_BYTES + 1];
          const k_r = bgrData[rawEnd * PIXEL_BYTES + 2];
          
          const k1_b = bgrData[(rawEnd + 1) * PIXEL_BYTES];
          const k1_g = bgrData[(rawEnd + 1) * PIXEL_BYTES + 1];
          const k1_r = bgrData[(rawEnd + 1) * PIXEL_BYTES + 2];

          if (k_b === k1_b && k_g === k1_g && k_r === k1_r) {
            break;
          }
        }
        rawEnd++;
      }
      
      const rawLength = rawEnd - i;
	  
      compressedChunks.push((0 << 7) | (rawLength - 1));
      compressedSize += 1 + rawLength * PIXEL_BYTES;

      for (let k = 0; k < rawLength; k++) {
        const idx = (i + k) * PIXEL_BYTES;
        compressedChunks.push(bgrData[idx], bgrData[idx + 1], bgrData[idx + 2]);
      }

      i += rawLength;
    }
  }

  const buffer = new ArrayBuffer(HEADER_SIZE + compressedSize);
  const view = new DataView(buffer);
  let offset = 0;

  // ID length
  view.setUint8(offset, 0);
  offset++;
  
  // Color map type
  view.setUint8(offset, 0);
  offset++;
  
  // Image type
  view.setUint8(offset, 10);
  offset++;
  
  // First entry index
  view.setUint16(offset, 0, true);
  offset += 2;
  
  // Color map length
  view.setUint16(offset, 0, true);
  offset += 2;
  
  // Color map entry
  view.setUint8(offset, 0);
  offset++;
  
  // X-origin
  view.setUint16(offset, 0, true);
  offset += 2;
	
  // Y-origin
  view.setUint16(offset, 0, true);
  offset += 2;
	
  // Width
  view.setUint16(offset, width, true);
  offset += 2;
  
  // Height
  view.setUint16(offset, height, true);
  offset += 2; 

  // Bit Depth
  view.setUint8(offset, 24);
  offset++;
  
  // Image Descriptor (vh flip bits)
  view.setUint8(offset, origin === 'bottom-left' ? 0 : 0x20);
  offset++;

  for (const byteValue of compressedChunks) {
    view.setUint8(offset, byteValue);
    offset++;
  }
  
  return buffer;
}

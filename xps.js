const fs = require('fs');
const model = fs.readFileSync(process.argv[2], 'utf-8').split('\r\n');
const modelName = process.argv[2].replace(/^.*[\\\/]/, '').replace(/\.[^/.]+$/, "");
let offset = 0;

function setPadding(buf) {
    let padAmount = buf.length % 16;
    padAmount = padAmount != 0 ? 16 - padAmount : padAmount;
    return padAmount != 0 ? Buffer.concat([buf, Buffer.alloc(padAmount)]) : buf;
}

function ignoreComment(line) {
  line = line.replace("#", " ");
  line = line.split()[0];
  return line;
}

function ignoreStringComment(line) {
  line = line.split("#")[0].trim();
  return line;
}

function readString() {
  var line, string;
  line = model[offset];
  offset++;
  string = ignoreStringComment(line);
  return string;
}

function readInt() {
  var line, number, value;
  line = model[offset];
  offset++;
  value = ignoreComment(line);
  number = parseInt(value);
  return number;
}

function splitValues(line) {
  var values;
  line = line.replace("#", " ");
  values = line.split(" ");
  return values;
}

function readXYZ() {
  var coords, line, values, x, y, z;
  line = model[offset];
  offset++;
  values = splitValues(line);
  x = parseFloat(values[0]);
  y = parseFloat(values[1]);
  z = parseFloat(values[2]);
  coords = [x, y, z];
  return coords;
}

function fillArray(array, minLen, value) {
  var filled;
  filled = array + [value] * (minLen - array.length);
  return filled;
}

function read4Int() {
  var a, b, g, line, r, values, vertexColor;
  line = model[offset];
  offset++;
  values = splitValues(line);
  r = parseInt(values[0]);
  g = parseInt(values[1]);
  b = parseInt(values[2]);
  a = parseInt(values[3]);
  vertexColor = [r, g, b, a];
  return vertexColor;
}

function readUvVert() {
  var coords, line, values, x, y;
  line = model[offset];
  offset++;
  values = splitValues(line);
  x = parseFloat(values[0]);
  y = parseFloat(values[1]);
  coords = [x, y];
  return coords;
}

function readBoneId() {
  var ids, line, values;
  line = model[offset];
  offset++;
  values = splitValues(line);
  ids = [];
  for (var i = 0; i < values.length; ++i) {
	  ids.push(parseInt(values[i]));
  }
  return ids;
}

function readBoneWeight() {
  var line, values, weights;
  line = model[offset];
  offset++;
  values = splitValues(line);
  weights = [];
  for (var i = 0; i < values.length; ++i) {
	  weights.push(parseFloat(values[i]));
  }
  return weights;
}

function readTriIdxs() {
  var face1, face2, face3, faceLoop, line, values;
  line = model[offset];
  offset++;
  values = splitValues(line);
  face1 = parseInt(values[0]);
  face2 = parseInt(values[1]);
  face3 = parseInt(values[2]);
  faceLoop = [face1, face2, face3];
  return faceLoop;
}

function limitNum(num, min, max) {
  const MIN = min || 1;
  const MAX = max || 20;
  const parsed = parseInt(num)
  return Math.min(Math.max(parsed, MIN), MAX)
}

function readMeshes(hasBones) {
  var boneIdx, boneWeight, boneWeights, coord, faces, meshCount, meshName, meshes, normal, textureCount, textureFile, textures, triCount, triIdxs, uvLayerCount, uvLayerId, uvVert, uvs, vertex, vertexColor, vertexCount, xpsMesh, xpsTexture, xpsVertex;
  meshes = [];
  meshCount = readInt();
  let faceBuffers = [];
  let vertexBuffers = [];
  let uvBuffers = [];
  for (var i = 0; i < meshCount; ++i) {
    meshName = readString();
    if (!meshName) meshName = "xxx";
    uvLayerCount = readInt();
    textures = [];
    textureCount = readInt();
    for (var j = 0; j < textureCount; ++j) {
      textureFile = readString();
      uvLayerId = readInt();
      textures.push([j, textureFile, uvLayerId]);
    }
    vertex = [];
    vertexCount = readInt();
    for (var k = 0; k < vertexCount; ++k) {
      coord = readXYZ();
      normal = readXYZ();
      vertexColor = read4Int();
      uvs = [];
      for (var l = 0; l < uvLayerCount; ++l) {
        uvVert = readUvVert();
        uvs.push(uvVert);
		let uvBuf = Buffer.alloc(8);
		uvBuf.writeFloatLE(uvVert[0]);
		uvBuf.writeFloatLE(uvVert[1], 4);
		uvBuffers.push(uvBuf);
      }
      boneWeights = [];
      if (hasBones) {
        boneIdx = readBoneId();
        boneWeight = readBoneWeight();
        for (var m = 0; m < boneIdx.length; ++m) {
          boneWeights.push(boneIdx[m], boneWeight[m]);
        }
      }
	  let vertexBuf = Buffer.alloc(18);
	  vertexBuf.writeFloatLE(coord[0]);
	  vertexBuf.writeFloatLE(coord[1], 4);
	  vertexBuf.writeFloatLE(coord[2], 8);
	  vertexBuf.writeInt16LE(limitNum(Math.round(normal[0] * 128 * 256), -32767, 32767), 12);
	  vertexBuf.writeInt16LE(limitNum(Math.round(normal[1] * 128 * 256), -32767, 32767), 14);
	  vertexBuf.writeInt16LE(limitNum(Math.round(normal[2] * 128 * 256), -32767, 32767), 16);
	  vertexBuf = Buffer.concat([vertexBuf, Buffer.from([0xFF, 0x7F]), Buffer.alloc(6), Buffer.from([0xFF, 0x7F])]); // temp
	  vertexBuffers.push(vertexBuf);
      vertex.push([k, coord, normal, vertexColor, uvs, boneWeights]);
    }
    faces = [];
    triCount = readInt();
    for (var n = 0; n < triCount; ++n) {
      triIdxs = readTriIdxs();
      faces.push(triIdxs);
    }
	faces.forEach(face => {
		let faceBuf = Buffer.alloc(6);
		faceBuf.writeUInt16LE(face[0]);
		faceBuf.writeUInt16LE(face[1], 2);
		faceBuf.writeUInt16LE(face[2], 4);
		faceBuffers.push(faceBuf);
	});
    meshes.push([meshName, textures, vertex, faces, uvLayerCount]);
  }
  faceBuffers = setPadding(Buffer.concat(faceBuffers));
  vertexBuffers = Buffer.concat(vertexBuffers);
  uvBuffers = Buffer.concat(uvBuffers);
  let output = Buffer.concat([faceBuffers, vertexBuffers, uvBuffers]);
  fs.writeFileSync(`./${modelName}_o`, output);
  return meshes;
}

function readBones() {
  var boneCount, boneName, bones, coords, parentId, xpsBone;
  bones = [];
  boneCount = readInt();
  for (var i = 0; i < boneCount; ++i) {
    boneName = readString();
    parentId = readInt();
    coords = readXYZ();
    bones.push([i, boneName, parentId, coords]);
  }
  return bones;
}

function readXpsModel() {
  var bones, hasBones, meshes, xpsModelData;
  bones = readBones();
  hasBones = bones.length > 0;
  meshes = readMeshes(hasBones);
}

xpsData = readXpsModel();
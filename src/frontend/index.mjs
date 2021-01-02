let items;

function drawMap(lonL, latT, lonR, latB, width, height) {
  const canvas = document.createElement('div');
  canvas.style.position = 'relative';
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  canvas.style.background = '#AADDFF';

  const scX = 1 / (lonR - lonL);
  const scY = 1 / (latB - latT);

  for (const item of items) {
    const point = document.createElement('div');
    point.style.position = 'absolute';
    const x = (item.lon - lonL) * scX;
    const y = (item.lat - latT) * scY;
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      continue;
    }
    point.style.top = y * height + 'px';
    point.style.left = x * width + 'px';
    point.style.width = '1px';
    point.style.height = '1px';
    point.style.background = 'rgba(255, 0, 0, 0.1)';
    canvas.appendChild(point);
  }
  return canvas;
}

async function init() {
  const locationsApi = await fetch('/api/locations');
  const locationsJson = await locationsApi.json();
  items = locationsJson.items;

  //const ul = document.createElement('ul');
  //document.body.appendChild(ul);
  //for (const item of locationsJson.items) {
  //  const li = document.createElement('li');
  //  li.appendChild(document.createTextNode(JSON.stringify(item)));
  //  ul.appendChild(li);
  //}

  document.body.appendChild(drawMap(-10, 60, 5, 48, 600, 750));
}

init();

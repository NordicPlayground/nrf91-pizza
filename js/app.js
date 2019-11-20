// Global objects

const api = new NRFCloudAPI(localStorage.getItem('apiKey'));
const leafletMap = L.map('leaflet-map').setView([63.4206897, 10.4372859], 15);
let counterInterval;
let requestInterval;
let flipped = false;

// Setup the map

leafletMap.addLayer(L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
	attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
	subdomains: 'abcd',
	maxZoom: 19,
}));

leafletMap.zoomControl.remove();

const pizzaMarker = L.marker([63.4206897, 10.4372859], {
	icon: L.icon({
		iconUrl: 'images/pizza_map_icon.png',
		iconSize: [40, 41],
		iconAnchor: [20, 41]
	})
}).addTo(leafletMap);

// Create marker for destination (NordicSemiconductor Oslo office)
L.marker([0, 0], {
	icon: L.icon({
		iconUrl: 'images/nordic_logo_small.png',
		iconSize: [40, 35],
		iconAnchor: [20, 18]
	})
})
.setLatLng({
	lat: Number(localStorage.getItem('destLat') || '59.919629'),
	lon: Number(localStorage.getItem('destLon') || '10.687080'),
})
.addTo(leafletMap);

// Create marker for BOSCH
L.marker([0, 0], {
	icon: L.icon({
		iconUrl: 'images/bosch_logo_small.png',
		iconSize: [80, 18],
		iconAnchor: [40, 9]
	})
})
.setLatLng({
	lat: Number(localStorage.getItem('boschLat') || '59.914682'),
	lon: Number(localStorage.getItem('boschLon') || '10.798602'),
})
.addTo(leafletMap);

// Load devices from nRFCloud api and populate list in settings view
function loadDeviceNames() {
	$('#device-list').empty().append('Refreshing device list...');
	api.devices().then(({ items }) => {
		if (items.length < 1) {
			throw new Error();
		}
		$('#device-list').empty();
		items.forEach(({ id, name }) => {
			const deviceItem = $(`<a class="list-group-item list-group-item-action">${name}</a>`);
			deviceItem.click(() => {
				$('#device-list').children().removeClass('active');
				deviceItem.addClass('active');
				localStorage.setItem('deviceId', id);
			});
			$('#device-list').append(deviceItem);
		});
	})
		.catch(() => $('#device-list').empty().append('No devices found.'));
}

// Show toast message
function showToast(title, subtitle, content, type, delay) {
	$.toast({ title, subtitle, content, type, delay });
}

// Simple NMEA GPGGA sentence decoder
function decodeGPS(data) {
	const [type, , lat, latHem, lon, lonHem] = data.split(',');
	if (type === '$GPGGA') {
		let la = Number(lat) / 100;
		let lo = Number(lon) / 100;
		la += -(la % 1) + (la % 1) / 60 * 100;
		lo += -(lo % 1) + (lo % 1) / 60 * 100;
		return {
			lat: la * (latHem === 'N' ? 1 : -1),
			lon: lo * (lonHem === 'E' ? 1 : -1),
		}
	}
	return undefined;
}

// Collection of update functions for different message types of nRFCloud device messages
const updateFunc = {
	FLIP: data => {
		if (data === 'UPSIDE_DOWN') {
			$('#flip').text('Yes');
			$('#flip-image').attr('src', 'images/pizzabox_down.png');
			if (!flipped) {
				showToast('Free Pizza!', '7 seconds ago', 'Your Pizza was flipped and landed upside down. It is now a mess but also free of charge.','success',15000);
				$('#cost').text('$0');
				$('#costText').text('Pizza is on us');
				flipped = true;
			}
		}
	},
	GPS: data => {
		const pos = decodeGPS(data);
		if (!pos) {
			return;
		}
		pizzaMarker.setLatLng(pos);
		// Pan to position and leave dots as a track
		leafletMap.panTo(pos).addLayer(L.circleMarker(pos, { radius: 4, color: '#00a9ce' }));
	},
	TEMP: data => {
		if (Number(data) < 40 && Number($('#temperature').text()) >= 40) {
			showToast('Free Pizza!', '5 seconds ago', 'Your Pizza temperature is below 40 degrees and is now free of charge.','success',15000);
			$('#cost').text('$0');
			$('#costText').text('Pizza is on us');
		}
		$('#temperature').text(data);
	}
}

function orderPizza() {
	// stop previous intervals if there was an order already
	clearInterval(counterInterval);
	clearInterval(requestInterval);

	// expect delivery in 30 minutes
	const arrivalTime = Number(new Date()) + 1800000;

	// countdown
	counterInterval = setInterval(() => {
		const eta = Math.trunc(((arrivalTime - new Date()) / 1000));
		if (eta >= 0) {
			$('#deliveryTime').text(`${Math.trunc(eta / 60)}:${(eta % 60).toString().padStart(2, '0')}`);
			return;
		}
		$('#deliveryTimeText').text('Pizza is late!');
		$('#deliveryTime').text('00:00');
		$('#cost').text('$0');
		$('#costText').text('Pizza is on us');
		showToast('Free Pizza!', '1 second ago', 'Oops! The delivery is running late and the Pizza is now free of charge.','success',15000);
		clearInterval(counterInterval);
	}, 30);

	// check nRFCloud messages from the device every 5 seconds
	requestInterval = setInterval(async () => {
		const { items } = await api.getMessages(localStorage.getItem('deviceId') || '');

		(items || [])
		.map(({ message }) => message)
		.forEach(({ appId, data }) => {
			if (!updateFunc[appId]) {
				console.log('unhandled appid', appId, data);
				return;
			}
			updateFunc[appId](data);
		});
	}, 5000);

	// change to track view
	$('#trackBtn').click();
}

// Main function
$(document).ready(() => {
	// Set initial values
	$('#api-key').val(localStorage.getItem('apiKey') || '');
	$('body').tooltip({ selector: '[data-toggle="tooltip"]' });

	// Main logo toggling fullscreen
	$('#mainlogo').click(() => document.documentElement.webkitRequestFullScreen());

	// Tab bar view selector buttons:
	$('.view-btn').click(({ target }) => {
		const id = target.id.replace('Btn', '');

		['splash', 'order', 'track', 'settings']
			.filter(key => key !== id)
			.forEach(key => {
				$(`#${key}View`).removeClass('d-flex').addClass('d-none');
				$(`#${key}Btn`).removeClass('text-white').addClass('nrf-light-blue');
			});

		$(`#${id}Btn`).removeClass('nrf-light-blue').addClass('text-white');
		$(`#${id}View`).removeClass('d-none').addClass('d-flex');

		if (id === 'settings') {
			loadDeviceNames();
		}
		if (id === 'track') {
			leafletMap.invalidateSize();
		}
	});

	// Settings view, api key change:
	$('#api-key').on('input', () => {
		api.accessToken = $('#api-key').val().trim();
		localStorage.setItem('apiKey', api.accessToken);
		loadDeviceNames();
	});

	// Order view, start ordering:
	$('#orderView a').click(({ target }) => {
		orderPizza();
		showToast(target.dataset.pizzaName,
			'1 second ago',
			'Your order was received and the Pizza is on its way. '
			+ 'The Pizza is free if it is too late, too cold, or dropped.',
			'success',
			15000,
		);
	});
});

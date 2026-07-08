// ---------- IndexedDB helper ----------
const DB_NAME = 'placesDB';
const STORE = 'places';
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function addPlace(place) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.add(place);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllPlaces() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.createdAt - b.createdAt));
    req.onerror = () => reject(req.error);
  });
}

async function deletePlace(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------- State ----------
let places = [];
let pendingPhotoBlob = null;
let activePlace = null;

// ---------- DOM refs ----------
const emptyState = document.getElementById('emptyState');
const carouselWrap = document.getElementById('carouselWrap');
const carouselTrack = document.getElementById('carouselTrack');
const placeCount = document.getElementById('placeCount');

const overlay = document.getElementById('overlay');
const addBtn = document.getElementById('addBtn');
const emptyAddBtn = document.getElementById('emptyAddBtn');
const closeModal = document.getElementById('closeModal');

const uploadZone = document.getElementById('uploadZone');
const photoInput = document.getElementById('photoInput');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const photoPreview = document.getElementById('photoPreview');

const nameInput = document.getElementById('nameInput');
const locationInput = document.getElementById('locationInput');
const gpsBtn = document.getElementById('gpsBtn');
const gpsStatus = document.getElementById('gpsStatus');
const submitBtn = document.getElementById('submitBtn');

const sheetOverlay = document.getElementById('sheetOverlay');
const sheetPhoto = document.getElementById('sheetPhoto');
const sheetName = document.getElementById('sheetName');
const sheetLocation = document.getElementById('sheetLocation');
const sheetCancel = document.getElementById('sheetCancel');
const deletePlaceBtn = document.getElementById('deletePlaceBtn');

let pendingLat = null;
let pendingLng = null;

// ---------- Init ----------
init();

async function init() {
  places = await getAllPlaces();
  places.forEach((place) => {
    place.photoUrl = URL.createObjectURL(place.photo);
  });
  renderAll();
}

function renderAll() {
  placeCount.textContent = places.length
    ? `${places.length} ta joy qo'shildi`
    : "Hali joylar qo'shilmagan";

  if (!places.length) {
    emptyState.hidden = false;
    carouselWrap.hidden = true;
    return;
  }
  emptyState.hidden = true;
  carouselWrap.hidden = false;
  renderCarousel();
}

function renderCarousel() {
  carouselTrack.innerHTML = '';
  places.forEach((place) => {
    carouselTrack.appendChild(buildCard(place));
  });
}

function buildCard(place) {
  const card = document.createElement('div');
  card.className = 'place-card';
  card.innerHTML = `
    <img src="${place.photoUrl}" alt="${escapeHtml(place.name)}">
    <div class="card-ring"></div>
    <div class="card-shade">
      <h3>${escapeHtml(place.name)}</h3>
      <p>📍 ${escapeHtml(place.location)}</p>
    </div>
  `;
  card.addEventListener('click', () => openSheet(place));
  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Add modal ----------
function openModal() {
  overlay.classList.add('open');
  resetForm();
}
function closeModalFn() {
  overlay.classList.remove('open');
}

addBtn.addEventListener('click', openModal);
emptyAddBtn.addEventListener('click', openModal);
closeModal.addEventListener('click', closeModalFn);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModalFn(); });

function resetForm() {
  pendingPhotoBlob = null;
  pendingLat = null;
  pendingLng = null;
  nameInput.value = '';
  locationInput.value = '';
  gpsStatus.textContent = '';
  photoPreview.hidden = true;
  photoPreview.src = '';
  uploadPlaceholder.hidden = false;
  photoInput.value = '';
  updateSubmitState();
}

uploadZone.addEventListener('click', () => photoInput.click());
photoInput.addEventListener('change', () => {
  const file = photoInput.files[0];
  if (!file) return;
  pendingPhotoBlob = file;
  const url = URL.createObjectURL(file);
  photoPreview.src = url;
  photoPreview.hidden = false;
  uploadPlaceholder.hidden = true;
  updateSubmitState();
});

nameInput.addEventListener('input', updateSubmitState);
locationInput.addEventListener('input', updateSubmitState);

function updateSubmitState() {
  submitBtn.disabled = !(pendingPhotoBlob && nameInput.value.trim() && locationInput.value.trim());
}

gpsBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    gpsStatus.textContent = "Bu qurilmada GPS mavjud emas";
    return;
  }
  gpsBtn.classList.add('loading');
  gpsStatus.textContent = 'Joylashuv aniqlanmoqda...';
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      pendingLat = pos.coords.latitude;
      pendingLng = pos.coords.longitude;
      gpsBtn.classList.remove('loading');
      gpsStatus.textContent = `Aniqlandi: ${pendingLat.toFixed(4)}, ${pendingLng.toFixed(4)}`;
      if (!locationInput.value.trim()) {
        try {
          const label = await reverseGeocode(pendingLat, pendingLng);
          if (label) locationInput.value = label;
        } catch (e) { /* ignore, manual entry still works */ }
      }
      updateSubmitState();
    },
    (err) => {
      gpsBtn.classList.remove('loading');
      gpsStatus.textContent = "Joylashuvni aniqlab bo'lmadi, qo'lda kiriting";
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

async function reverseGeocode(lat, lng) {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`);
  if (!res.ok) return null;
  const data = await res.json();
  const a = data.address || {};
  return a.suburb || a.neighbourhood || a.town || a.city || a.village || a.county || data.display_name?.split(',')[0] || null;
}

submitBtn.addEventListener('click', async () => {
  if (submitBtn.disabled) return;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saqlanmoqda...';

  const place = {
    name: nameInput.value.trim(),
    location: locationInput.value.trim(),
    lat: pendingLat,
    lng: pendingLng,
    photo: pendingPhotoBlob,
    createdAt: Date.now(),
  };

  const id = await addPlace(place);
  place.id = id;
  place.photoUrl = URL.createObjectURL(pendingPhotoBlob);
  places.push(place);

  submitBtn.textContent = "Qo'shish";
  closeModalFn();
  renderAll();
});

// ---------- Map bottom sheet ----------
function openSheet(place) {
  activePlace = place;
  sheetPhoto.src = place.photoUrl;
  sheetName.textContent = place.name;
  sheetLocation.textContent = place.location;
  sheetOverlay.classList.add('open');
}
function closeSheet() {
  sheetOverlay.classList.remove('open');
  activePlace = null;
}
sheetCancel.addEventListener('click', closeSheet);
sheetOverlay.addEventListener('click', (e) => { if (e.target === sheetOverlay) closeSheet(); });

document.querySelectorAll('.map-opt').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!activePlace) return;
    const url = buildMapUrl(btn.dataset.map, activePlace);
    window.open(url, '_blank');
    closeSheet();
  });
});

function buildMapUrl(app, place) {
  const hasCoords = place.lat != null && place.lng != null;
  const query = encodeURIComponent(place.location + ' ' + place.name);

  if (app === 'google') {
    return hasCoords
      ? `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${query}`;
  }
  if (app === 'yandex') {
    return hasCoords
      ? `https://yandex.com/maps/?rtext=~${place.lat},${place.lng}&rtt=auto`
      : `https://yandex.com/maps/?text=${query}`;
  }
  if (app === '2gis') {
    return hasCoords
      ? `https://2gis.kz/routeSearch/rsType/car/to/${place.lng},${place.lat}`
      : `https://2gis.kz/search/${query}`;
  }
  return '#';
}

deletePlaceBtn.addEventListener('click', async () => {
  if (!activePlace) return;
  await deletePlace(activePlace.id);
  places = places.filter((p) => p.id !== activePlace.id);
  closeSheet();
  renderAll();
});

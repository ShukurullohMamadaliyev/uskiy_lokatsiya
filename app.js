// ---------- Supabase (shared database + photo storage) ----------
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    lat: row.lat,
    lng: row.lng,
    photoUrl: row.photo_url,
    createdAt: new Date(row.created_at).getTime(),
  };
}

async function getAllPlaces() {
  const { data, error } = await sb
    .from('places')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(mapRow);
}

async function addPlace({ name, location, lat, lng, photoFile }) {
  const ext = (photoFile.name.split('.').pop() || 'jpg').toLowerCase();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await sb.storage.from('photos').upload(fileName, photoFile);
  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = sb.storage.from('photos').getPublicUrl(fileName);

  const { data, error } = await sb
    .from('places')
    .insert({ name, location, lat, lng, photo_url: publicUrl })
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}

// Live updates: when a friend adds a place, it appears for everyone without a refresh
sb
  .channel('places-changes')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'places' }, (payload) => {
    const newPlace = mapRow(payload.new);
    if (!places.some((p) => p.id === newPlace.id)) {
      places.push(newPlace);
      renderAll();
    }
  })
  .subscribe();

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
const suggestions = document.getElementById('suggestions');
const gpsBtn = document.getElementById('gpsBtn');
const mapPickBtn = document.getElementById('mapPickBtn');
const gpsStatus = document.getElementById('gpsStatus');
const submitBtn = document.getElementById('submitBtn');

const sheetOverlay = document.getElementById('sheetOverlay');
const sheetPhoto = document.getElementById('sheetPhoto');
const sheetName = document.getElementById('sheetName');
const sheetLocation = document.getElementById('sheetLocation');
const sheetCancel = document.getElementById('sheetCancel');

const mapPickerOverlay = document.getElementById('mapPickerOverlay');
const mapPickerClose = document.getElementById('mapPickerClose');
const mapPickConfirm = document.getElementById('mapPickConfirm');
const mapSearchInput = document.getElementById('mapSearchInput');
const mapSuggestions = document.getElementById('mapSuggestions');

const imageViewerOverlay = document.getElementById('imageViewerOverlay');
const viewerImg = document.getElementById('viewerImg');

const themeBtn = document.getElementById('themeBtn');
const themeOverlay = document.getElementById('themeOverlay');
const themeClose = document.getElementById('themeClose');
const themeGrid = document.getElementById('themeGrid');

let pendingLat = null;
let pendingLng = null;

// ---------- Theme picker ----------
const THEMES = [
  { id: 'aurora', label: 'Aurora', emoji: '🌌' },
  { id: 'onyx', label: 'Qora Onyx', emoji: '⚫' },
  { id: 'emerald', label: 'Zumrad', emoji: '💚' },
  { id: 'crimson', label: 'Qizil Baxmal', emoji: '❤️‍🔥' },
  { id: 'ocean', label: 'Okean', emoji: '🌊' },
  { id: 'amethyst', label: 'Ametist', emoji: '💜' },
  { id: 'sunset', label: 'Kunbotar', emoji: '🌅' },
  { id: 'rosegold', label: 'Atlas Oltin', emoji: '🌹' },
  { id: 'arctic', label: 'Muz Shamol', emoji: '❄️' },
  { id: 'graphite', label: "Po'lat", emoji: '⚙️' },
];
const THEME_KEY = 'siteTheme';

function applyTheme(id) {
  if (id === 'aurora') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', id);
  }
  localStorage.setItem(THEME_KEY, id);
}

function buildThemeGrid() {
  const current = localStorage.getItem(THEME_KEY) || 'aurora';
  themeGrid.innerHTML = '';
  THEMES.forEach((t) => {
    const btn = document.createElement('button');
    btn.className = 'theme-swatch' + (t.id === current ? ' active' : '');
    btn.dataset.theme = t.id;
    btn.innerHTML = `
      <span class="theme-swatch-check">✓</span>
      <span class="theme-swatch-label">${t.emoji} ${t.label}</span>
    `;
    btn.addEventListener('click', () => {
      applyTheme(t.id);
      themeGrid.querySelectorAll('.theme-swatch').forEach((el) => {
        el.classList.toggle('active', el === btn);
      });
      themeOverlay.classList.remove('open');
    });
    themeGrid.appendChild(btn);
  });
}

themeBtn.addEventListener('click', () => {
  buildThemeGrid();
  themeOverlay.classList.add('open');
});
themeClose.addEventListener('click', () => themeOverlay.classList.remove('open'));
themeOverlay.addEventListener('click', (e) => { if (e.target === themeOverlay) themeOverlay.classList.remove('open'); });

applyTheme(localStorage.getItem(THEME_KEY) || 'aurora');

// ---------- Init ----------
init();

async function init() {
  try {
    places = await getAllPlaces();
  } catch (e) {
    places = [];
  }
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

const HOLD_DURATION = 5000;

function buildCard(place) {
  const card = document.createElement('div');
  card.className = 'place-card';
  card.innerHTML = `
    <img class="card-img" src="${place.photoUrl}" alt="${escapeHtml(place.name)}">
    <div class="card-ring"></div>
    <div class="hold-ring">
      <svg viewBox="0 0 64 64">
        <circle class="track" cx="32" cy="32" r="26"></circle>
        <circle class="progress" cx="32" cy="32" r="26"></circle>
      </svg>
    </div>
    <div class="card-shade">
      <h3>${escapeHtml(place.name)}</h3>
      <p>📍 ${escapeHtml(place.location)}</p>
    </div>
  `;

  const holdRing = card.querySelector('.hold-ring');
  let holdTimer = null;
  let longPressFired = false;

  const startHold = () => {
    longPressFired = false;
    holdRing.classList.remove('active');
    void holdRing.offsetWidth;
    holdRing.classList.add('active');
    holdTimer = setTimeout(() => {
      longPressFired = true;
      holdRing.classList.remove('active');
      openImageViewer(place);
    }, HOLD_DURATION);
  };
  const cancelHold = () => {
    clearTimeout(holdTimer);
    holdRing.classList.remove('active');
  };

  card.addEventListener('pointerdown', startHold);
  card.addEventListener('pointerup', cancelHold);
  card.addEventListener('pointerleave', cancelHold);
  card.addEventListener('pointercancel', cancelHold);
  card.addEventListener('contextmenu', (e) => e.preventDefault());
  card.addEventListener('click', () => {
    if (longPressFired) { longPressFired = false; return; }
    openSheet(place);
  });

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
  hideSuggestions();
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
locationInput.addEventListener('input', () => {
  updateSubmitState();
  searchLocation(locationInput.value.trim());
});

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
      hideSuggestions();
      try {
        const label = await reverseGeocode(pendingLat, pendingLng);
        if (label) locationInput.value = label;
      } catch (e) { /* ignore, manual entry still works */ }
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

// ---------- Location search (autocomplete) ----------
let searchDebounce = null;

function hideSuggestions() {
  suggestions.innerHTML = '';
  suggestions.hidden = true;
}

function searchLocation(query) {
  clearTimeout(searchDebounce);
  if (query.length < 3) {
    hideSuggestions();
    return;
  }
  searchDebounce = setTimeout(async () => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6`);
      if (!res.ok) return;
      const results = await res.json();
      renderSuggestions(results);
    } catch (e) { /* ignore, manual entry still works */ }
  }, 400);
}

function renderSuggestions(results) {
  if (!results.length) {
    hideSuggestions();
    return;
  }
  suggestions.innerHTML = '';
  results.forEach((r) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.textContent = r.display_name;
    item.addEventListener('click', () => {
      locationInput.value = r.display_name;
      pendingLat = parseFloat(r.lat);
      pendingLng = parseFloat(r.lon);
      hideSuggestions();
      updateSubmitState();
    });
    suggestions.appendChild(item);
  });
  suggestions.hidden = false;
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.location-autocomplete')) hideSuggestions();
});

// ---------- Full image viewer (long-press on a card) ----------
function openImageViewer(place) {
  viewerImg.src = place.photoUrl;
  imageViewerOverlay.classList.add('open');
}
function closeImageViewer() {
  imageViewerOverlay.classList.remove('open');
}
imageViewerOverlay.addEventListener('click', closeImageViewer);

// ---------- Map picker (3D, MapLibre GL + OpenFreeMap) ----------
let pickerMap = null;
let pickerMarker = null;

function ensurePickerMap() {
  if (pickerMap) return;
  const startLat = pendingLat ?? 41.3111;
  const startLng = pendingLng ?? 69.2797;
  pickerMap = new maplibregl.Map({
    container: 'pickerMap',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [startLng, startLat],
    zoom: pendingLat ? 15 : 5.5,
    pitch: 55,
    bearing: -15,
    antialias: true,
  });
  pickerMap.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  pickerMarker = new maplibregl.Marker({ draggable: true, color: '#ff3d9a' })
    .setLngLat([startLng, startLat])
    .addTo(pickerMap);
  pickerMap.on('click', (e) => pickerMarker.setLngLat(e.lngLat));
}

mapPickBtn.addEventListener('click', () => {
  mapPickerOverlay.classList.add('open');
  // wait for the modal's open transition (0.25s) to finish before creating the
  // WebGL map, otherwise it can init mid-transition and get stuck with a blank canvas
  setTimeout(() => {
    ensurePickerMap();
    pickerMap.resize();
  }, 350);
});

function closeMapPicker() {
  mapPickerOverlay.classList.remove('open');
  mapSearchInput.value = '';
  hideMapSuggestions();
}
mapPickerClose.addEventListener('click', closeMapPicker);
mapPickerOverlay.addEventListener('click', (e) => { if (e.target === mapPickerOverlay) closeMapPicker(); });

mapPickConfirm.addEventListener('click', async () => {
  const ll = pickerMarker.getLngLat();
  pendingLat = ll.lat;
  pendingLng = ll.lng;
  hideSuggestions();
  mapPickConfirm.textContent = 'Aniqlanmoqda...';
  try {
    const label = await reverseGeocode(pendingLat, pendingLng);
    locationInput.value = label || `${pendingLat.toFixed(4)}, ${pendingLng.toFixed(4)}`;
  } catch (e) {
    locationInput.value = `${pendingLat.toFixed(4)}, ${pendingLng.toFixed(4)}`;
  }
  mapPickConfirm.textContent = 'Shu joyni tanlash';
  updateSubmitState();
  closeMapPicker();
});

// ---------- Map picker search (biased to Uzbekistan) ----------
let mapSearchDebounce = null;

function hideMapSuggestions() {
  mapSuggestions.innerHTML = '';
  mapSuggestions.hidden = true;
}

mapSearchInput.addEventListener('input', () => {
  clearTimeout(mapSearchDebounce);
  const query = mapSearchInput.value.trim();
  if (query.length < 3) {
    hideMapSuggestions();
    return;
  }
  mapSearchDebounce = setTimeout(async () => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=uz&limit=6`);
      if (!res.ok) return;
      const results = await res.json();
      renderMapSuggestions(results);
    } catch (e) { /* ignore, manual pin drop still works */ }
  }, 400);
});

function renderMapSuggestions(results) {
  if (!results.length) {
    hideMapSuggestions();
    return;
  }
  mapSuggestions.innerHTML = '';
  results.forEach((r) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.textContent = r.display_name;
    item.addEventListener('click', () => {
      const lat = parseFloat(r.lat);
      const lng = parseFloat(r.lon);
      ensurePickerMap();
      pickerMap.flyTo({ center: [lng, lat], zoom: 15, pitch: 55 });
      pickerMarker.setLngLat([lng, lat]);
      mapSearchInput.value = r.display_name;
      hideMapSuggestions();
    });
    mapSuggestions.appendChild(item);
  });
  mapSuggestions.hidden = false;
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.map-search')) hideMapSuggestions();
});

submitBtn.addEventListener('click', async () => {
  if (submitBtn.disabled) return;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saqlanmoqda...';

  try {
    const place = await addPlace({
      name: nameInput.value.trim(),
      location: locationInput.value.trim(),
      lat: pendingLat,
      lng: pendingLng,
      photoFile: pendingPhotoBlob,
    });
    places.push(place);
    closeModalFn();
    renderAll();
  } catch (e) {
    gpsStatus.textContent = "Saqlab bo'lmadi, internetni tekshirib qayta urinib ko'ring";
    submitBtn.disabled = false;
  }

  submitBtn.textContent = "Qo'shish";
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

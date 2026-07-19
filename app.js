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
    author: row.author,
    category: row.category,
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

async function uploadPhoto(file) {
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const { error: uploadError } = await sb.storage.from('photos').upload(fileName, file);
  if (uploadError) throw uploadError;
  const { data: { publicUrl } } = sb.storage.from('photos').getPublicUrl(fileName);
  return publicUrl;
}

async function addPlace({ name, location, lat, lng, author, category, photoFiles }) {
  const urls = [];
  for (const file of photoFiles) {
    urls.push(await uploadPhoto(file));
  }

  const { data, error } = await sb
    .from('places')
    .insert({ name, location, lat, lng, author, category, photo_url: urls[0] })
    .select()
    .single();
  if (error) throw error;

  if (urls.length) {
    await sb.from('place_photos').insert(urls.map((photo_url) => ({ place_id: data.id, photo_url })));
  }

  return mapRow(data);
}

async function getPlacePhotos(placeId) {
  const { data, error } = await sb.from('place_photos').select('photo_url').eq('place_id', placeId).order('created_at', { ascending: true });
  if (error) return [];
  return data.map((r) => r.photo_url);
}

async function getComments(placeId) {
  const { data, error } = await sb.from('comments').select('*').eq('place_id', placeId).order('created_at', { ascending: true });
  if (error) return [];
  return data;
}

async function addComment(placeId, author, text) {
  const { error } = await sb.from('comments').insert({ place_id: placeId, author, text });
  if (error) throw error;
}

async function getReactions(placeId) {
  const { data, error } = await sb.from('reactions').select('emoji').eq('place_id', placeId);
  if (error) return {};
  const counts = {};
  data.forEach((r) => { counts[r.emoji] = (counts[r.emoji] || 0) + 1; });
  return counts;
}

async function addReaction(placeId, emoji) {
  const { error } = await sb.from('reactions').insert({ place_id: placeId, emoji });
  if (error) throw error;
}

// Live updates: when a friend adds a place / comments / reacts, it shows up for everyone without a refresh
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

sb
  .channel('comments-changes')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, (payload) => {
    if (activePlace && payload.new.place_id === activePlace.id) {
      getComments(activePlace.id).then(renderComments);
    }
  })
  .subscribe();

sb
  .channel('reactions-changes')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions' }, (payload) => {
    if (activePlace && payload.new.place_id === activePlace.id) {
      getReactions(activePlace.id).then((counts) => renderReactions(activePlace.id, counts));
    }
  })
  .subscribe();

// ---------- State ----------
let places = [];
let pendingPhotoFiles = [];
let activePlace = null;
let selectedCategory = null;
let searchQuery = '';
let activeCategoryFilter = null;

const CATEGORIES = [
  { id: 'mountain', label: "Tog'", emoji: '🏔️' },
  { id: 'sea', label: 'Dengiz', emoji: '🏖️' },
  { id: 'restaurant', label: 'Restoran', emoji: '🍢' },
  { id: 'nature', label: 'Tabiat', emoji: '🌳' },
  { id: 'city', label: 'Shahar', emoji: '🏙️' },
  { id: 'other', label: 'Boshqa', emoji: '📍' },
];
const REACTION_EMOJIS = ['😍', '🔥', '👍', '😂', '🤩'];
const AUTHOR_KEY = 'authorName';

// ---------- DOM refs ----------
const emptyState = document.getElementById('emptyState');
const carouselWrap = document.getElementById('carouselWrap');
const carouselTrack = document.getElementById('carouselTrack');
const placeCount = document.getElementById('placeCount');
const noResults = document.getElementById('noResults');

const toolbar = document.getElementById('toolbar');
const searchInput = document.getElementById('searchInput');
const filterChips = document.getElementById('filterChips');

const overlay = document.getElementById('overlay');
const addBtn = document.getElementById('addBtn');
const emptyAddBtn = document.getElementById('emptyAddBtn');
const closeModal = document.getElementById('closeModal');

const uploadZone = document.getElementById('uploadZone');
const photoInput = document.getElementById('photoInput');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const photoPreviewStrip = document.getElementById('photoPreviewStrip');

const authorInput = document.getElementById('authorInput');
const nameInput = document.getElementById('nameInput');
const locationInput = document.getElementById('locationInput');
const suggestions = document.getElementById('suggestions');
const gpsBtn = document.getElementById('gpsBtn');
const mapPickBtn = document.getElementById('mapPickBtn');
const gpsStatus = document.getElementById('gpsStatus');
const categoryPicker = document.getElementById('categoryPicker');
const submitBtn = document.getElementById('submitBtn');

const sheetOverlay = document.getElementById('sheetOverlay');
const sheetGallery = document.getElementById('sheetGallery');
const sheetName = document.getElementById('sheetName');
const sheetLocation = document.getElementById('sheetLocation');
const sheetAuthor = document.getElementById('sheetAuthor');
const reactionBar = document.getElementById('reactionBar');
const commentsList = document.getElementById('commentsList');
const commentInput = document.getElementById('commentInput');
const commentSendBtn = document.getElementById('commentSendBtn');
const sheetCancel = document.getElementById('sheetCancel');

const mapPickerOverlay = document.getElementById('mapPickerOverlay');
const mapPickerClose = document.getElementById('mapPickerClose');
const mapPickConfirm = document.getElementById('mapPickConfirm');
const mapSearchInput = document.getElementById('mapSearchInput');
const mapSuggestions = document.getElementById('mapSuggestions');

const mapOverviewBtn = document.getElementById('mapOverviewBtn');
const overviewMapOverlay = document.getElementById('overviewMapOverlay');
const overviewMapClose = document.getElementById('overviewMapClose');

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
  { id: 'aurora', label: 'Yashin', emoji: '⚡' },
  { id: 'onyx', label: 'Zulmat', emoji: '🖤' },
  { id: 'emerald', label: "O'rmon", emoji: '🌲' },
  { id: 'crimson', label: "Cho'g'", emoji: '🔥' },
  { id: 'ocean', label: 'Okean', emoji: '⚓' },
  { id: 'amethyst', label: 'Kosmos', emoji: '🌌' },
  { id: 'sunset', label: 'Lava', emoji: '🌋' },
  { id: 'rosegold', label: 'Sahro', emoji: '🏜️' },
  { id: 'arctic', label: 'Muzlik', emoji: '🧊' },
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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

async function init() {
  try {
    places = await getAllPlaces();
  } catch (e) {
    places = [];
  }
  renderAll();
}

function renderAll() {
  const regionCount = new Set(places.map((p) => p.location)).size;
  placeCount.textContent = places.length
    ? `${places.length} ta joy • ${regionCount} ta hudud`
    : "Hali joylar qo'shilmagan";

  if (!places.length) {
    toolbar.hidden = true;
    emptyState.hidden = false;
    carouselWrap.hidden = true;
    noResults.hidden = true;
    return;
  }
  toolbar.hidden = false;
  if (!filterChips.children.length) buildFilterChips();
  emptyState.hidden = true;
  renderCarousel();
}

function getFilteredPlaces() {
  return places.filter((p) => {
    if (activeCategoryFilter && p.category !== activeCategoryFilter) return false;
    if (searchQuery) {
      const haystack = (p.name + ' ' + p.location).toLowerCase();
      if (!haystack.includes(searchQuery)) return false;
    }
    return true;
  });
}

function renderCarousel() {
  const filtered = getFilteredPlaces();
  carouselTrack.innerHTML = '';
  filtered.forEach((place) => {
    carouselTrack.appendChild(buildCard(place));
  });
  carouselWrap.hidden = filtered.length === 0;
  noResults.hidden = filtered.length !== 0;
}

searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  renderCarousel();
});

function buildFilterChips() {
  filterChips.innerHTML = '';
  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = 'chip' + (activeCategoryFilter === null ? ' active' : '');
  allChip.textContent = 'Hammasi';
  allChip.addEventListener('click', () => {
    activeCategoryFilter = null;
    buildFilterChips();
    renderCarousel();
  });
  filterChips.appendChild(allChip);

  CATEGORIES.forEach((c) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (activeCategoryFilter === c.id ? ' active' : '');
    chip.textContent = `${c.emoji} ${c.label}`;
    chip.addEventListener('click', () => {
      activeCategoryFilter = activeCategoryFilter === c.id ? null : c.id;
      buildFilterChips();
      renderCarousel();
    });
    filterChips.appendChild(chip);
  });
}

const HOLD_DURATION = 5000;

function buildCard(place) {
  const category = CATEGORIES.find((c) => c.id === place.category);
  const card = document.createElement('div');
  card.className = 'place-card';
  card.innerHTML = `
    <img class="card-img" src="${place.photoUrl}" alt="${escapeHtml(place.name)}" loading="lazy" decoding="async">
    ${category ? `<div class="card-badge">${category.emoji}</div>` : ''}
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
      ${place.author ? `<p class="card-author">👤 ${escapeHtml(place.author)}</p>` : ''}
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
  pendingPhotoFiles = [];
  pendingLat = null;
  pendingLng = null;
  authorInput.value = localStorage.getItem(AUTHOR_KEY) || '';
  nameInput.value = '';
  locationInput.value = '';
  gpsStatus.textContent = '';
  photoInput.value = '';
  renderPhotoPreviewStrip();
  hideSuggestions();
  selectedCategory = null;
  buildCategoryPicker();
  updateSubmitState();
}

async function compressImage(file, maxDim = 1600, quality = 0.82) {
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
  } catch (e) {
    return file; // fallback to the original if compression isn't supported
  }
}

uploadZone.addEventListener('click', () => photoInput.click());
photoInput.addEventListener('change', async () => {
  const files = Array.from(photoInput.files || []);
  if (!files.length) return;
  for (const file of files) {
    pendingPhotoFiles.push(await compressImage(file));
  }
  photoInput.value = '';
  renderPhotoPreviewStrip();
  updateSubmitState();
});

function renderPhotoPreviewStrip() {
  photoPreviewStrip.innerHTML = '';
  if (!pendingPhotoFiles.length) {
    photoPreviewStrip.hidden = true;
    uploadPlaceholder.hidden = false;
    return;
  }
  uploadPlaceholder.hidden = true;
  photoPreviewStrip.hidden = false;

  pendingPhotoFiles.forEach((file, idx) => {
    const item = document.createElement('div');
    item.className = 'photo-preview-item';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'photo-preview-remove';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      pendingPhotoFiles.splice(idx, 1);
      renderPhotoPreviewStrip();
      updateSubmitState();
    });
    item.appendChild(img);
    item.appendChild(removeBtn);
    photoPreviewStrip.appendChild(item);
  });

  const addMore = document.createElement('button');
  addMore.type = 'button';
  addMore.className = 'photo-preview-add';
  addMore.textContent = '+';
  addMore.addEventListener('click', (e) => {
    e.stopPropagation();
    photoInput.click();
  });
  photoPreviewStrip.appendChild(addMore);
}

function buildCategoryPicker() {
  categoryPicker.innerHTML = '';
  CATEGORIES.forEach((c) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (selectedCategory === c.id ? ' active' : '');
    chip.textContent = `${c.emoji} ${c.label}`;
    chip.addEventListener('click', () => {
      selectedCategory = selectedCategory === c.id ? null : c.id;
      buildCategoryPicker();
    });
    categoryPicker.appendChild(chip);
  });
}

authorInput.addEventListener('input', updateSubmitState);
nameInput.addEventListener('input', updateSubmitState);
locationInput.addEventListener('input', () => {
  updateSubmitState();
  searchLocation(locationInput.value.trim());
});

function updateSubmitState() {
  submitBtn.disabled = !(
    pendingPhotoFiles.length &&
    authorInput.value.trim() &&
    nameInput.value.trim() &&
    locationInput.value.trim()
  );
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
    const authorName = authorInput.value.trim();
    localStorage.setItem(AUTHOR_KEY, authorName);
    const place = await addPlace({
      name: nameInput.value.trim(),
      location: locationInput.value.trim(),
      lat: pendingLat,
      lng: pendingLng,
      author: authorName,
      category: selectedCategory,
      photoFiles: pendingPhotoFiles,
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

// ---------- Place detail bottom sheet ----------
function addGalleryThumb(url) {
  const img = document.createElement('img');
  img.src = url;
  img.loading = 'lazy';
  img.alt = '';
  img.addEventListener('click', () => openImageViewer({ photoUrl: url }));
  sheetGallery.appendChild(img);
}

function renderReactions(placeId, counts) {
  reactionBar.innerHTML = '';
  REACTION_EMOJIS.forEach((emoji) => {
    const count = counts[emoji] || 0;
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'reaction-pill';
    pill.innerHTML = `<span>${emoji}</span>` + (count ? `<span class="count">${count}</span>` : '');
    pill.addEventListener('click', async () => {
      try {
        await addReaction(placeId, emoji);
        renderReactions(placeId, await getReactions(placeId));
      } catch (e) { /* ignore */ }
    });
    reactionBar.appendChild(pill);
  });
}

function renderComments(list) {
  commentsList.innerHTML = '';
  if (!list.length) {
    commentsList.innerHTML = '<p class="comment-empty">Hali izoh yo\'q. Birinchi bo\'ling!</p>';
    return;
  }
  list.forEach((c) => {
    const item = document.createElement('div');
    item.className = 'comment-item';
    const authorEl = document.createElement('div');
    authorEl.className = 'comment-author';
    authorEl.textContent = c.author || 'Anonim';
    const textEl = document.createElement('div');
    textEl.className = 'comment-text';
    textEl.textContent = c.text;
    item.appendChild(authorEl);
    item.appendChild(textEl);
    commentsList.appendChild(item);
  });
  commentsList.scrollTop = commentsList.scrollHeight;
}

async function submitComment() {
  const text = commentInput.value.trim();
  if (!text || !activePlace) return;
  const placeId = activePlace.id;
  const author = localStorage.getItem(AUTHOR_KEY) || 'Anonim';
  commentInput.value = '';
  commentInput.disabled = true;
  try {
    await addComment(placeId, author, text);
    renderComments(await getComments(placeId));
  } catch (e) {
    commentInput.value = text;
  }
  commentInput.disabled = false;
}
commentSendBtn.addEventListener('click', submitComment);
commentInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitComment(); });

function openSheet(place) {
  activePlace = place;
  sheetName.textContent = place.name;
  sheetLocation.textContent = '📍 ' + place.location;
  if (place.author) {
    sheetAuthor.textContent = '👤 ' + place.author;
    sheetAuthor.hidden = false;
  } else {
    sheetAuthor.hidden = true;
  }
  sheetOverlay.classList.add('open');

  sheetGallery.innerHTML = '';
  addGalleryThumb(place.photoUrl);
  getPlacePhotos(place.id).then((urls) => {
    urls.filter((u) => u !== place.photoUrl).forEach(addGalleryThumb);
  });

  renderReactions(place.id, {});
  getReactions(place.id).then((counts) => renderReactions(place.id, counts));

  commentsList.innerHTML = '<p class="comment-empty">Yuklanmoqda...</p>';
  getComments(place.id).then(renderComments);
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

// ---------- Overview map: every place at once ----------
let overviewMap = null;
let overviewMarkers = [];

function ensureOverviewMap() {
  if (overviewMap) return;
  overviewMap = new maplibregl.Map({
    container: 'overviewMap',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [69.2797, 41.3111],
    zoom: 5.5,
    pitch: 45,
    antialias: true,
  });
  overviewMap.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
}

function renderOverviewMarkers() {
  overviewMarkers.forEach((m) => m.remove());
  overviewMarkers = [];
  const withCoords = places.filter((p) => p.lat != null && p.lng != null);
  withCoords.forEach((p) => {
    const marker = new maplibregl.Marker({ color: '#ff3d9a' }).setLngLat([p.lng, p.lat]).addTo(overviewMap);
    marker.getElement().style.cursor = 'pointer';
    marker.getElement().addEventListener('click', () => {
      overviewMapOverlay.classList.remove('open');
      openSheet(p);
    });
    overviewMarkers.push(marker);
  });
  if (withCoords.length) {
    const lngs = withCoords.map((p) => p.lng);
    const lats = withCoords.map((p) => p.lat);
    overviewMap.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 60, maxZoom: 12, duration: 0 }
    );
  }
}

mapOverviewBtn.addEventListener('click', () => {
  overviewMapOverlay.classList.add('open');
  setTimeout(() => {
    ensureOverviewMap();
    overviewMap.resize();
    renderOverviewMarkers();
  }, 350);
});
overviewMapClose.addEventListener('click', () => overviewMapOverlay.classList.remove('open'));
overviewMapOverlay.addEventListener('click', (e) => { if (e.target === overviewMapOverlay) overviewMapOverlay.classList.remove('open'); });

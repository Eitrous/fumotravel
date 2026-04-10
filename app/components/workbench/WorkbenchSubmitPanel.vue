<script setup lang="ts">
import type { GeocodeResult, LatLng, PrivacyMode, SubmitPostPayload } from '~~/shared/fumo'
import { STORAGE_BUCKET } from '~~/shared/fumo'

const auth = useAuthState()
const { t } = useI18n()
const { formatLatLng } = useFormatters()

const selectedFile = ref<File | null>(null)
const thumbnailFile = ref<File | null>(null)
const imagePreviewUrl = ref('')
const thumbPreviewUrl = ref('')
const fileInputKey = ref(0)

const title = ref('')
const body = ref('')
const placeName = ref('')
const countryName = ref<string | null>(null)
const regionName = ref<string | null>(null)
const cityName = ref<string | null>(null)
const privacyMode = ref<PrivacyMode>('approx')
const exactLocation = ref<LatLng | null>(null)
const publicLocation = ref<LatLng | null>(null)
const capturedAt = ref('')

const searchQuery = ref('')
const searchResults = ref<GeocodeResult[]>([])
const searching = ref(false)
const detectingExif = ref(false)
const reverseLookupPending = ref(false)
const uploading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const submitNextPath = '/?panel=submit'

const revokePreviewUrls = () => {
  if (imagePreviewUrl.value) {
    URL.revokeObjectURL(imagePreviewUrl.value)
  }

  if (thumbPreviewUrl.value) {
    URL.revokeObjectURL(thumbPreviewUrl.value)
  }

  imagePreviewUrl.value = ''
  thumbPreviewUrl.value = ''
}

const resetForm = () => {
  title.value = ''
  body.value = ''
  placeName.value = ''
  countryName.value = null
  regionName.value = null
  cityName.value = null
  privacyMode.value = 'approx'
  exactLocation.value = null
  publicLocation.value = null
  capturedAt.value = ''
  selectedFile.value = null
  thumbnailFile.value = null
  searchQuery.value = ''
  searchResults.value = []
  revokePreviewUrls()
  fileInputKey.value += 1
}

const toDateTimeLocalValue = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const createThumbnail = async (file: File) => {
  const bitmap = await createImageBitmap(file)
  const longestSide = Math.max(bitmap.width, bitmap.height)
  const scale = Math.min(1, 720 / longestSide)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error(t('submit.errors.cannotCreateThumbnailCanvas'))
  }

  context.fillStyle = '#fffaf3'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.84)
  })

  if (!blob) {
    throw new Error(t('submit.errors.thumbnailFailed'))
  }

  return new File([blob], 'thumb.jpg', {
    type: 'image/jpeg'
  })
}

const applyGeocodeResult = (result: GeocodeResult) => {
  placeName.value = result.placeName
  countryName.value = result.countryName
  regionName.value = result.regionName
  cityName.value = result.cityName
}

const reverseLookupLocation = async (location: LatLng) => {
  reverseLookupPending.value = true

  try {
    const result = await $fetch<GeocodeResult>('/api/geocode/reverse', {
      query: {
        lat: location.lat,
        lng: location.lng
      }
    })

    applyGeocodeResult(result)
  } catch {
    // Reverse lookup is only a convenience and should not block manual input.
  } finally {
    reverseLookupPending.value = false
  }
}

const handleExactLocationUpdate = (location: LatLng | null) => {
  exactLocation.value = location

  if (!location) {
    return
  }

  publicLocation.value = location
  void reverseLookupLocation(location)
}

const handlePublicLocationUpdate = (location: LatLng | null) => {
  publicLocation.value = location
}

const runPlaceSearch = async () => {
  errorMessage.value = ''

  if (!searchQuery.value.trim()) {
    return
  }

  searching.value = true

  try {
    searchResults.value = await $fetch<GeocodeResult[]>('/api/geocode/search', {
      query: {
        q: searchQuery.value.trim()
      }
    })
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('submit.errors.searchFailed')
  } finally {
    searching.value = false
  }
}

const selectSearchResult = (result: GeocodeResult) => {
  searchQuery.value = result.displayName
  searchResults.value = []
  exactLocation.value = {
    lat: result.lat,
    lng: result.lng
  }

  if (privacyMode.value === 'exact' || !publicLocation.value) {
    publicLocation.value = {
      lat: result.lat,
      lng: result.lng
    }
  }

  applyGeocodeResult(result)
}

const extractExif = async (file: File) => {
  detectingExif.value = true

  try {
    const { parse } = await import('exifr')
    const exif = await parse(file, {
      pick: ['latitude', 'longitude', 'DateTimeOriginal', 'DateTimeDigitized', 'CreateDate']
    })

    const lat = typeof exif?.latitude === 'number' ? exif.latitude : null
    const lng = typeof exif?.longitude === 'number' ? exif.longitude : null
    const captured = exif?.DateTimeOriginal || exif?.DateTimeDigitized || exif?.CreateDate

    if (lat != null && lng != null) {
      handleExactLocationUpdate({
        lat,
        lng
      })
    }

    if (captured instanceof Date) {
      capturedAt.value = toDateTimeLocalValue(captured)
    }
  } finally {
    detectingExif.value = false
  }
}

const onFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] || null

  errorMessage.value = ''
  successMessage.value = ''
  selectedFile.value = file
  thumbnailFile.value = null
  revokePreviewUrls()

  if (!file) {
    return
  }

  imagePreviewUrl.value = URL.createObjectURL(file)

  try {
    thumbnailFile.value = await createThumbnail(file)
    thumbPreviewUrl.value = URL.createObjectURL(thumbnailFile.value)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('submit.errors.thumbnailFailed')
  }

  try {
    await extractExif(file)
  } catch {
    // EXIF is optional; silent fallback keeps the flow moving.
  }
}

watch(privacyMode, (mode) => {
  if (mode === 'exact' && exactLocation.value) {
    publicLocation.value = exactLocation.value
  }
})

watch(
  () => [auth.ready.value, auth.user.value?.id, auth.hasUsername.value],
  () => {
    if (!auth.ready.value) {
      return
    }

    if (!auth.user.value) {
      void navigateTo(createWorkbenchLocation('login', {
        next: submitNextPath
      }), { replace: true })
      return
    }

    if (!auth.hasUsername.value) {
      void navigateTo(createWorkbenchLocation('onboarding', {
        next: submitNextPath
      }), { replace: true })
    }
  },
  { immediate: true }
)

const submitPost = async () => {
  errorMessage.value = ''
  successMessage.value = ''

  if (!selectedFile.value) {
    errorMessage.value = t('submit.errors.selectPhoto')
    return
  }

  if (!title.value.trim()) {
    errorMessage.value = t('submit.errors.titleRequired')
    return
  }

  if (!exactLocation.value) {
    errorMessage.value = t('submit.errors.exactRequired')
    return
  }

  if (!publicLocation.value) {
    errorMessage.value = t('submit.errors.publicRequired')
    return
  }

  const viewer = auth.viewer.value
  if (!viewer) {
    errorMessage.value = t('submit.errors.sessionExpired')
    return
  }

  uploading.value = true

  const supabase = useSupabaseBrowserClient()
  const postFolder = crypto.randomUUID()
  const safeExtension = selectedFile.value.name.split('.').pop()?.toLowerCase()?.replace(/[^a-z0-9]/g, '') || 'jpg'
  const originalPath = `${viewer.userId}/${postFolder}/original.${safeExtension}`
  const thumbPath = thumbnailFile.value
    ? `${viewer.userId}/${postFolder}/thumb.jpg`
    : null

  try {
    const { error: uploadOriginalError } = await supabase
      .storage
      .from(STORAGE_BUCKET)
      .upload(originalPath, selectedFile.value, {
        upsert: false,
        contentType: selectedFile.value.type || undefined
      })

    if (uploadOriginalError) {
      throw uploadOriginalError
    }

    if (thumbnailFile.value && thumbPath) {
      const { error: uploadThumbError } = await supabase
        .storage
        .from(STORAGE_BUCKET)
        .upload(thumbPath, thumbnailFile.value, {
          upsert: false,
          contentType: 'image/jpeg'
        })

      if (uploadThumbError) {
        throw uploadThumbError
      }
    }

    const payload: SubmitPostPayload = {
      title: title.value.trim(),
      body: body.value.trim() || null,
      imagePath: originalPath,
      thumbPath,
      capturedAt: capturedAt.value ? new Date(capturedAt.value).toISOString() : null,
      exactLocation: exactLocation.value,
      publicLocation: publicLocation.value,
      privacyMode: privacyMode.value,
      placeName: placeName.value.trim(),
      countryName: countryName.value,
      regionName: regionName.value,
      cityName: cityName.value
    }

    await $fetch('/api/posts', {
      method: 'POST',
      headers: auth.authHeaders.value,
      body: payload
    })

    successMessage.value = t('submit.success')
    resetForm()
  } catch (error) {
    await supabase
      .storage
      .from(STORAGE_BUCKET)
      .remove([originalPath, thumbPath].filter(Boolean) as string[])

    errorMessage.value = error instanceof Error ? error.message : t('submit.errors.submitFailed')
  } finally {
    uploading.value = false
  }
}

onBeforeUnmount(() => {
  revokePreviewUrls()
})
</script>

<template>
  <section class="workbench-panel workbench-panel--submit">
    <span class="eyebrow">{{ t('submit.eyebrow') }}</span>
    <h2 class="workbench-panel__title">{{ t('submit.title') }}</h2>

    <div class="field-grid">
      <section class="photo-drop">
        <strong>{{ t('submit.photoSectionTitle') }}</strong>

        <input
          :key="fileInputKey"
          class="field-input"
          type="file"
          accept="image/*"
          @change="onFileChange"
        >

        <div v-if="detectingExif || reverseLookupPending" class="chip-row">
          <span v-if="detectingExif" class="status-inline">{{ t('submit.exifReading') }}</span>
          <span v-if="reverseLookupPending" class="status-inline">{{ t('submit.reverseLookup') }}</span>
        </div>

        <div v-if="selectedFile" class="photo-preview">
          <img :src="imagePreviewUrl" :alt="selectedFile.name">
        </div>

        <div v-if="thumbPreviewUrl" class="photo-preview photo-preview--thumb">
          <img :src="thumbPreviewUrl" :alt="t('submit.thumbnailAlt')">
        </div>
      </section>

      <section class="field-grid">
        <label class="field-label">
          <span>{{ t('submit.titleLabel') }}</span>
          <input
            v-model="title"
            class="field-input"
            maxlength="80"
            :placeholder="t('submit.titlePlaceholder')"
          >
        </label>

        <label class="field-label">
          <span>{{ t('submit.bodyLabel') }}</span>
          <textarea
            v-model="body"
            class="field-textarea"
            maxlength="1000"
            :placeholder="t('submit.bodyPlaceholder')"
          />
        </label>

        <label class="field-label">
          <span>{{ t('submit.capturedAtLabel') }}</span>
          <input v-model="capturedAt" class="field-input" type="datetime-local">
        </label>

        <div class="privacy-toggle">
          <label class="privacy-pill">
            <input v-model="privacyMode" type="radio" value="approx">
            {{ t('submit.privacyApprox') }}
          </label>
          <label class="privacy-pill">
            <input v-model="privacyMode" type="radio" value="exact">
            {{ t('submit.privacyExact') }}
          </label>
        </div>

      </section>
    </div>

    <section class="field-grid">
      <div class="picker-toolbar">
        <div>
          <strong>{{ t('submit.locationSectionTitle') }}</strong>
        </div>
        <div class="picker-coords">
          <div class="picker-coords__group">
            <code>{{ t('submit.exactLocationLabel', { value: formatLatLng(exactLocation) }) }}</code>
            <code>{{ t('submit.publicLocationLabel', { value: formatLatLng(publicLocation) }) }}</code>
          </div>
        </div>
      </div>

      <LocationPickerMap
        :exact-location="exactLocation"
        :public-location="publicLocation"
        :privacy-mode="privacyMode"
        @update:exact-location="handleExactLocationUpdate"
        @update:public-location="handlePublicLocationUpdate"
      />
    </section>

    <section class="field-grid field-grid--two">
      <div class="field-grid">
        <label class="field-label">
          <span>{{ t('submit.searchLabel') }}</span>
          <div class="inline-actions workbench-inline-search">
            <input
              v-model="searchQuery"
              class="field-input"
              :placeholder="t('submit.searchPlaceholder')"
              @keyup.enter="runPlaceSearch"
            >
            <button class="ghost-button" type="button" :disabled="searching" @click="runPlaceSearch">
              <i class="button-icon fa-solid fa-magnifying-glass" aria-hidden="true" />
              <span>{{ searching ? t('submit.searching') : t('submit.searchButton') }}</span>
            </button>
          </div>
        </label>

        <ul v-if="searchResults.length" class="search-results">
          <li v-for="result in searchResults" :key="`${result.lat}-${result.lng}-${result.displayName}`">
            <button type="button" @click="selectSearchResult(result)">
              <strong>{{ result.placeName }}</strong>
              <span>{{ result.displayName }}</span>
            </button>
          </li>
        </ul>
      </div>

      <div class="field-grid">
        <label class="field-label">
          <span>{{ t('submit.publicPlaceLabel') }}</span>
          <input v-model="placeName" class="field-input" :placeholder="t('submit.publicPlacePlaceholder')">
        </label>

        <div class="field-grid field-grid--two">
          <label class="field-label">
            <span>{{ t('submit.countryLabel') }}</span>
            <input v-model="countryName" class="field-input" :placeholder="t('submit.countryPlaceholder')">
          </label>
          <label class="field-label">
            <span>{{ t('submit.regionLabel') }}</span>
            <input v-model="regionName" class="field-input" :placeholder="t('submit.regionPlaceholder')">
          </label>
        </div>

        <label class="field-label">
          <span>{{ t('submit.cityLabel') }}</span>
          <input v-model="cityName" class="field-input" :placeholder="t('submit.cityPlaceholder')">
        </label>
      </div>
    </section>

    <div class="workbench-panel__actions">
      <button class="button" type="button" :disabled="uploading" @click="submitPost">
        <i class="button-icon fa-solid fa-paper-plane" aria-hidden="true" />
        <span>{{ uploading ? t('submit.submitting') : t('submit.submitButton') }}</span>
      </button>
      <button class="ghost-button" type="button" @click="navigateTo(createWorkbenchLocation('info'))">
        <i class="button-icon fa-solid fa-arrow-left" aria-hidden="true" />
        <span>{{ t('submit.backToOverview') }}</span>
      </button>
    </div>

    <p v-if="successMessage" class="success-banner">{{ successMessage }}</p>
    <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>
  </section>
</template>

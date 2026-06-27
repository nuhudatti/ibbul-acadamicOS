/** Client-only department branding (logo) — no backend changes. */

export interface DepartmentBrand {
  logoDataUrl?: string
  updatedAt?: string
}

const storageKey = (userId: number | string) => `ibbul-dept-brand:${userId}`

export function getDepartmentBrand(userId: number | string | undefined | null): DepartmentBrand | null {
  if (typeof window === 'undefined' || userId == null) return null
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    return JSON.parse(raw) as DepartmentBrand
  } catch {
    return null
  }
}

export function setDepartmentBrand(userId: number | string, brand: DepartmentBrand): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(
    storageKey(userId),
    JSON.stringify({ ...brand, updatedAt: new Date().toISOString() })
  )
}

export function clearDepartmentBrand(userId: number | string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(storageKey(userId))
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file (PNG, JPG, or SVG).'))
      return
    }
    if (file.size > 512_000) {
      reject(new Error('Image must be under 500 KB.'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read image.'))
    reader.readAsDataURL(file)
  })
}

import localforage from 'localforage'

// LocalForage 설정
localforage.config({
  driver: localforage.INDEXEDDB,
  name: 'RealLease',
  version: 1.0,
  storeName: 'app_data',
  description: 'RealLease application data'
})

export class StorageService {
  async get<T>(key: string): Promise<T | null> {
    try {
      return await localforage.getItem<T>(key)
    } catch (error) {
      console.error('Storage get error:', error)
      return null
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await localforage.setItem(key, value)
    } catch (error) {
      console.error('Storage set error:', error)
      throw error
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await localforage.removeItem(key)
    } catch (error) {
      console.error('Storage remove error:', error)
      throw error
    }
  }

  async clear(): Promise<void> {
    try {
      await localforage.clear()
    } catch (error) {
      console.error('Storage clear error:', error)
      throw error
    }
  }

  async keys(): Promise<string[]> {
    try {
      return await localforage.keys()
    } catch (error) {
      console.error('Storage keys error:', error)
      return []
    }
  }
}

export const storageService = new StorageService()

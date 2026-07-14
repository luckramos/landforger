import { create } from 'zustand'

interface UiState {
  /** Motion scale — multiply-is-slower; written to `--mo` on the app root. */
  motionScale: number
  setMotionScale: (scale: number) => void
}

export const useUiStore = create<UiState>((set) => ({
  motionScale: 1,
  setMotionScale: (scale) => set({ motionScale: scale }),
}))

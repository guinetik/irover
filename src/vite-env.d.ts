/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '*.glsl?raw' {
  const value: string
  export default value
}

declare module '*.glb?url' {
  const url: string
  export default url
}

declare module '*.jpg?url' {
  const url: string
  export default url
}

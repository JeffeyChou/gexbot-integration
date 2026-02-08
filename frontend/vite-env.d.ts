/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_LLM_API_KEY: string;
    readonly VITE_LLM_BASE_URL: string;
    readonly VITE_LLM_MODEL: string;
    readonly VITE_AUTH_USERNAME: string;
    readonly VITE_AUTH_PASSWORD: string;
    readonly VITE_VIEWER_PASSWORD: string;
    // more env variables...
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

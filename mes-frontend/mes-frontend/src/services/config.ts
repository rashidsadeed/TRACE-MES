/**
 * API Configuration
 *
 * Controls whether the app uses mock data or a real REST backend.
 * Set VITE_API_MODE=mock (default) or VITE_API_MODE=real in .env
 */

export const API_MODE = import.meta.env.VITE_API_MODE ?? "mock";
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api";

export const isMockMode = (): boolean => API_MODE === "mock";

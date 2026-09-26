import { io } from 'socket.io-client';

const isProd = import.meta.env.PROD;
const defaultUrl = isProd ? undefined : `${window.location.protocol}//${window.location.hostname}:3001`;
const URL = import.meta.env.VITE_SERVER_URL || defaultUrl;

export const socket = io(URL, {
    autoConnect: false
});


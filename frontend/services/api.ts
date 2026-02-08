import { GexApiResponse, GexMajorLevelsResponse, GexMaxChangeResponse } from './mockData';

const BASE_URL = '/api';

export const fetchMajors = async (ticker: string = 'SPX'): Promise<GexMajorLevelsResponse> => {
    const response = await fetch(`${BASE_URL}/majors?ticker=${ticker}&_t=${Date.now()}`);
    if (!response.ok) {
        throw new Error('Failed to fetch majors');
    }
    return response.json();
};

export const fetchMaxChange = async (ticker: string = 'SPX'): Promise<GexMaxChangeResponse> => {
    const response = await fetch(`${BASE_URL}/max-change?ticker=${ticker}&_t=${Date.now()}`);
    if (!response.ok) {
        throw new Error('Failed to fetch max change');
    }
    return response.json();
};

export const fetchChain = async (ticker: string = 'SPX'): Promise<GexApiResponse> => {
    const response = await fetch(`${BASE_URL}/chain?ticker=${ticker}&_t=${Date.now()}`);
    if (!response.ok) {
        throw new Error('Failed to fetch chain');
    }
    return response.json();
};

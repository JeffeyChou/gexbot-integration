import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import { GexApiResponse } from '../services/mockData';

interface History3DChartProps {
    apiData: GexApiResponse;
    spotPrice: number;
}

export const History3DChart: React.FC<History3DChartProps> = ({ apiData, spotPrice }) => {
    const chartData = useMemo(() => {
        // Labels for the time dimension (X-axis)
        // 0 = Current, 1 = 1m ago, 2 = 5m ago, 3 = 10m ago, 4 = 15m ago, 5 = 30m ago
        // We reverse this for chronological plotting: 30m -> 15m -> 10m -> 5m -> 1m -> Current
        const timeLabels = ['-30m', '-15m', '-10m', '-5m', '-1m', 'Current'];

        // Filter strikes to Spot +/- 50 range
        const lowerBound = spotPrice - 50;
        const upperBound = spotPrice + 50;

        const filteredStrikes = apiData.strikes
            .filter((s) => {
                const strike = s[0] as number;
                return strike >= lowerBound && strike <= upperBound;
            })
            .sort((a, b) => (a[0] as number) - (b[0] as number)); // Ensure sorted by strike

        if (filteredStrikes.length === 0) return [];

        // For Surface Plot:
        // Z is a 2D array of values used for the height and color of the surface.
        // X is a 1D or 2D array of x-coords (Time in our case)
        // Y is a 1D or 2D array of y-coords (Strikes in our case)

        // Rows correspond to Strikes (Y)
        // Columns correspond to Time (X)

        const zData: number[][] = [];
        const yData: number[] = []; // Strikes

        filteredStrikes.forEach((s) => {
            const strike = s[0] as number;
            const gexVol = s[1] as number;
            const priors = Array.isArray(s[3]) ? (s[3] as number[]) : [0, 0, 0, 0, 0];

            yData.push(strike);

            // Chronological order: 30m, 15m, 10m, 5m, 1m, Current
            const row = [
                priors[4], // 30m
                priors[3], // 15m
                priors[2], // 10m
                priors[1], // 5m
                priors[0], // 1m
                gexVol     // Current
            ];
            zData.push(row);
        });

        return [{
            type: 'surface',
            z: zData,
            x: timeLabels,
            y: yData,
            colorscale: [
                [0, 'rgb(239, 68, 68)'],   // Red for negative
                [0.5, 'rgb(31, 41, 55)'], // Dark/Black for zero (approx)
                [1, 'rgb(16, 185, 129)']  // Green for positive
            ],
            // We need to set cmin/cmax or let it auto-scale. 
            // For GEX roughly centered on 0, auto-scale might be skewed if net GEX is very positive.
            // Let's try to center the colorscale if possible, or use a custom divergent scale.
            // "RdBu" is a good standard divergent scale, but let's stick to the requested Green/Red theme.
            showscale: false, // Hide color bar to save space maybe? Or keep it.
            contours: {
                z: {
                    show: true,
                    usecolormap: true,
                    highlightcolor: "#42f462",
                    project: { z: true }
                }
            },
            opacity: 0.9,
        }];
    }, [apiData, spotPrice]);

    return (
        <div className="w-full h-[600px] bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <h3 className="text-gray-200 font-semibold mb-4 ml-2">Historical GEX Surface</h3>
            <Plot
                data={chartData as any}
                layout={{
                    autosize: true,
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    margin: {
                        l: 0,
                        r: 0,
                        b: 0,
                        t: 0,
                    },
                    scene: {
                        xaxis: { title: 'Time', color: '#9ca3af' },
                        yaxis: { title: 'Strike', color: '#9ca3af' },
                        zaxis: { title: 'Net GEX', color: '#9ca3af' },
                        camera: {
                            eye: { x: 1.8, y: 1.8, z: 1.2 }
                        }
                    },
                    showlegend: false,
                }}
                useResizeHandler={true}
                style={{ width: '100%', height: '100%' }}
                config={{ displayModeBar: false }}
            />
        </div>
    );
};

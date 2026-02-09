import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import { GexApiResponse } from '../services/mockData';

interface History3DChartProps {
    apiData: GexApiResponse;
}

const TIME_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'];

export const History3DChart: React.FC<History3DChartProps> = ({ apiData }) => {
    const { surfaceTrace, spotPathTrace } = useMemo(() => {
        const timeLabels = ['-30m', '-15m', '-10m', '-5m', '-1m', 'Now'];
        
        // Use historical spot prices or fallback to current spot
        const spotPriors = apiData.spot_priors || [apiData.spot, apiData.spot, apiData.spot, apiData.spot, apiData.spot, apiData.spot];
        const currentSpot = apiData.spot;

        // Filter strikes to [min(spot_priors)*0.995, max(spot_priors)*1.005] and round to integers
        const minSpot = Math.min(...spotPriors);
        const maxSpot = Math.max(...spotPriors);
        const lowerBound = minSpot * 0.995;
        const upperBound = maxSpot * 1.005;
        
        const allStrikes = [...apiData.strikes]
            .filter(s => {
                const strike = s[0] as number;
                return strike >= lowerBound && strike <= upperBound;
            })
            .sort((a, b) => (a[0] as number) - (b[0] as number));

        if (allStrikes.length === 0) {
            return { surfaceTrace: [], spotPathTrace: null };
        }

        const zData: number[][] = [];
        const yData: number[] = [];

        allStrikes.forEach((s) => {
            const strike = Math.round(s[0] as number);
            const gexVol = s[1] as number;
            const priors = Array.isArray(s[3]) ? (s[3] as number[]) : [0, 0, 0, 0, 0];

            yData.push(strike);

            const row = [
                priors[4] ?? 0,
                priors[3] ?? 0,
                priors[2] ?? 0,
                priors[1] ?? 0,
                priors[0] ?? 0,
                gexVol
            ];
            zData.push(row);
        });

        const maxAbs = Math.max(...zData.flat().map(Math.abs), 1);

        const surface = {
            type: 'surface' as const,
            z: zData,
            x: timeLabels,
            y: yData,
            colorscale: [
                [0, 'rgb(239, 68, 68)'],
                [0.5, 'rgb(31, 41, 55)'],
                [1, 'rgb(16, 185, 129)']
            ],
            cmin: -maxAbs,
            cmax: maxAbs,
            showscale: false,
            contours: {
                z: {
                    show: true,
                    usecolormap: true,
                    highlightcolor: "#42f462",
                    project: { z: true }
                }
            },
            opacity: 0.85,
            name: 'GEX Surface',
            hovertemplate: 'Time: %{x}<br>Strike: %{y}<br>GEX Vol: %{z:.1f}<extra></extra>',
        };

        // Find Z values at historical spot prices for each time point
        const spotZValues = spotPriors.map((spotPrice, timeIdx) => {
            const spotIdx = yData.reduce((best, s, i) =>
                Math.abs(s - spotPrice) < Math.abs(yData[best] - spotPrice) ? i : best, 0);
            return zData[spotIdx] ? zData[spotIdx][timeIdx] : 0;
        });

        const spotPath = {
            type: 'scatter3d' as const,
            mode: 'lines+markers' as const,
            x: timeLabels,
            y: spotPriors,
            z: spotZValues,
            line: {
                color: '#f59e0b',
                width: 3,
            },
            marker: {
                size: 3,
                color: '#f59e0b',
                symbol: 'circle',
            },
            name: `Spot Path`,
            hovertemplate: 'Time: %{x}<br>Spot: %{y:.2f}<br>GEX at Spot: %{z:.1f}<extra>Spot Path</extra>',
        };

        return { surfaceTrace: [surface], spotPathTrace: spotPath };
    }, [apiData]);

    const allTraces = useMemo(() => {
        const traces: any[] = [...surfaceTrace];
        if (spotPathTrace) traces.push(spotPathTrace);
        return traces;
    }, [surfaceTrace, spotPathTrace]);

    return (
        <div className="w-full h-[350px] bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-gray-200 font-semibold ml-2">Historical GEX Surface</h3>
                <div className="flex items-center gap-3 mr-2">
                    {['-30m', '-15m', '-10m', '-5m', '-1m', 'Now'].map((label, i) => (
                        <span key={label} className="text-xs font-mono font-medium" style={{ color: TIME_COLORS[i] }}>
                            {label}
                        </span>
                    ))}
                </div>
            </div>
            <Plot
                data={allTraces}
                layout={{
                    autosize: true,
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    margin: { l: 0, r: 0, b: 0, t: 0 },
                    scene: {
                        xaxis: {
                            title: { text: 'Time', font: { color: '#d1d5db', size: 12 } },
                            color: '#9ca3af',
                            tickfont: { size: 11, color: '#d1d5db' },
                            gridcolor: '#374151',
                        },
                        yaxis: {
                            title: { text: 'Strike Price', font: { color: '#d1d5db', size: 12 } },
                            color: '#9ca3af',
                            tickfont: { size: 11, color: '#d1d5db' },
                            gridcolor: '#374151',
                        },
                        zaxis: {
                            title: { text: 'GEX Value (Volume)', font: { color: '#d1d5db', size: 12 } },
                            color: '#9ca3af',
                            tickfont: { size: 10, color: '#9ca3af' },
                            gridcolor: '#374151',
                        },
                        camera: {
                            eye: { x: 1.8, y: 1.8, z: 1.2 }
                        },
                    },
                    showlegend: true,
                    legend: {
                        x: 0.01,
                        y: 0.99,
                        bgcolor: 'rgba(17,24,39,0.8)',
                        bordercolor: '#374151',
                        borderwidth: 1,
                        font: { color: '#d1d5db', size: 10 },
                    },
                }}
                useResizeHandler={true}
                style={{ width: '100%', height: '100%' }}
                config={{ displayModeBar: false }}
            />
        </div>
    );
};

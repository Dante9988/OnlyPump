'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, LineData } from 'lightweight-charts';

interface TokenPriceChartProps {
  tokenMint: string;
  data?: LineData[];
  height?: number;
  width?: number;
}

export default function TokenPriceChart({ 
  tokenMint, 
  data = [], 
  height = 400, 
  width = 600 
}: TokenPriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chart, setChart] = useState<IChartApi | null>(null);
  const [series, setSeries] = useState<ISeriesApi<"Line"> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sample data if no data is provided
  const sampleData: LineData[] = [
    { time: '2023-01-01', value: 0.01 },
    { time: '2023-01-02', value: 0.012 },
    { time: '2023-01-03', value: 0.015 },
    { time: '2023-01-04', value: 0.013 },
    { time: '2023-01-05', value: 0.016 },
    { time: '2023-01-06', value: 0.018 },
    { time: '2023-01-07', value: 0.02 },
    { time: '2023-01-08', value: 0.022 },
    { time: '2023-01-09', value: 0.025 },
    { time: '2023-01-10', value: 0.023 },
    { time: '2023-01-11', value: 0.026 },
    { time: '2023-01-12', value: 0.028 },
    { time: '2023-01-13', value: 0.03 },
    { time: '2023-01-14', value: 0.035 },
    { time: '2023-01-15', value: 0.04 },
  ];

  // Initialize chart
  useEffect(() => {
    if (chartContainerRef.current) {
      const chartOptions = {
        layout: {
          background: { type: ColorType.Solid, color: '#1e1e2d' },
          textColor: '#d1d4dc',
        },
        grid: {
          vertLines: { color: '#2e2e3e' },
          horzLines: { color: '#2e2e3e' },
        },
        width,
        height,
      };
      
      const chart = createChart(chartContainerRef.current, chartOptions);
      
      const lineSeries = chart.addSeries('Area' as any, {
        color: '#00c087',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        lastValueVisible: true,
        priceLineVisible: true,
      });
      
      // Use sample data if no data provided
      const chartData = data.length > 0 ? data : sampleData;
      lineSeries.setData(chartData);
      
      chart.timeScale().fitContent();
      
      setChart(chart);
      setSeries(lineSeries as any);
      setIsLoading(false);
      
      // Cleanup function
      return () => {
        chart.remove();
        setChart(null);
        setSeries(null);
      };
    }
  }, [tokenMint, data]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      if (chart && chartContainerRef.current) {
        chart.applyOptions({ 
          width: chartContainerRef.current.clientWidth 
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [chart]);

  // Update data if it changes
  useEffect(() => {
    if (series && data.length > 0) {
      series.setData(data);
    }
  }, [data, series]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center" style={{ height }}>
        <div className="loading loading-spinner loading-lg"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center" style={{ height }}>
        <div className="text-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="token-price-chart w-full">
      <div ref={chartContainerRef} className="chart-container w-full" />
    </div>
  );
}

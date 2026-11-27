import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import { formatEur } from "./format";

// Bundled locally (no CDN); only the parts we use, rendered as SVG.
echarts.use([BarChart, GridComponent, TooltipComponent, SVGRenderer]);

/**
 * A small horizontal bar chart of one current split (e.g. Verfügbar / Gebunden), one bar per
 * row in the given order. Bars rather than a pie, because debts can make a share negative.
 */
export function BreakdownChart({ label, rows }: { label: string; rows: { name: string; value: number }[] }) {
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue("--accent").trim() || "#1f5fbf";
    const text = css.getPropertyValue("--text").trim() || "#1c2430";
    const chart = echarts.init(element.current!, undefined, { renderer: "svg" });
    chart.setOption({
      animation: false,
      grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "item",
        formatter: (p: { name: string; value: number }) => `${p.name}: ${formatEur(p.value)}`,
      },
      xAxis: {
        type: "value",
        // The amounts are in the table next to the chart; axis numbers would only crowd it.
        axisLabel: { show: false },
        splitLine: { lineStyle: { color: "#e6e9ee" } },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: rows.map((r) => r.name),
        axisLabel: { color: text },
        axisLine: { lineStyle: { color: "#c5cbd3" } },
        axisTick: { show: false },
      },
      series: [
        {
          name: label,
          type: "bar",
          data: rows.map((r) => r.value),
          barMaxWidth: 20,
          itemStyle: { color: accent, borderRadius: 4 },
        },
      ],
    });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [label, rows]);

  return (
    <figure className="chart" aria-label={label}>
      <div ref={element} style={{ width: "100%", height: 48 + rows.length * 36 }} />
    </figure>
  );
}

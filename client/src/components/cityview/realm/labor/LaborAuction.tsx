import { useMemo } from "react";
import { useLabor } from "../../../../hooks/helpers/useLabor";
import useRealmStore from "../../../../hooks/store/useRealmStore";
import { getPosition, getZone } from "../../../../utils/utils";
import clsx from "clsx";
import useUIStore from "../../../../hooks/store/useUIStore";

type LaborAuctionProps = {
  className?: string;
};

export const LaborAuction = ({ className }: LaborAuctionProps) => {
  const realmId = useRealmStore((state) => state.realmId);

  const { useLaborAuctionCoefficient } = useLabor();

  const position = realmId ? getPosition(realmId) : undefined;
  const zone = position ? getZone(position.x) : undefined;
  const setTooltip = useUIStore((state) => state.setTooltip);

  const coefficient = zone ? useLaborAuctionCoefficient(zone) || 0 : 0;

  const demandColors = useMemo(() => {
    if (coefficient <= 1) {
      return {
        text: "text-order-brilliance",
        bg: "!bg-order-brilliance text-order-brilliance",
        container: "!bg-order-brilliance/40 text-order-brilliance/40",
      };
    }
    if (coefficient <= 1.25) {
      return {
        text: "text-order-fox",
        bg: "!bg-order-fox text-order-fox",
        container: "!bg-order-fox/40 text-order-fox/40",
      };
    }
    return {
      text: "text-order-giants",
      bg: "!bg-order-giants text-order-giants",
      container: "!bg-order-giants/40 text-order-giants/40",
    };
  }, [coefficient]);

  const demandTooltip = useMemo(() => {
    const discount = Math.abs((1 - coefficient) * 100).toFixed(0);
    if (coefficient <= 0.65) {
      return (
        <div className="flex flex-col items-center text-xxs">
          <div className={clsx("font-bold text-xxs", demandColors.text)}>No Demand</div>
          <div>
            <span className={clsx("italic", demandColors.text)}>{discount}% discount</span> on next build.
          </div>
        </div>
      );
    }
    if (coefficient <= 1) {
      return (
        <div className="flex flex-col items-center text-xxs">
          <div className={clsx("font-bold text-xxs", demandColors.text)}>Low Demand</div>
          <div>
            <span className={clsx("italic", demandColors.text)}>{discount}% discount</span> on next build.
          </div>
        </div>
      );
    }
    if (coefficient <= 1.25) {
      return (
        <div className="flex flex-col items-center text-xxs">
          <div className={clsx("font-bold text-xxs", demandColors.text)}>Increased Demand</div>
          <div>
            <span className={clsx("italic", demandColors.text)}>{discount}% higher cost</span> on next build.
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center text-xxs">
        <div className={clsx("font-bold text-xxs", demandColors.text)}>High Demand</div>
        <div>
          <span className={clsx("italic", demandColors.text)}>{discount}% higher cost</span> on next build.
        </div>
      </div>
    );
  }, [coefficient]);

  const progress = useMemo(() => {
    if (coefficient <= 0.5) {
      return 0;
    }
    if (coefficient >= 1.5) {
      return 100;
    }
    return (coefficient - 0.5) * 100;
  }, [coefficient]);

  return (
    <div
      onMouseEnter={() =>
        setTooltip({
          position: "top",
          content: demandTooltip,
        })
      }
      onMouseLeave={() => setTooltip(null)}
      className={clsx("flex flex-col items-center  w-14 h-14 justify-center relative  -mt-2", className)}
    >
      <div className={clsx(demandColors.text, "text-[12px] font-bold")}>
        ×{coefficient ? coefficient.toFixed(2) : 1}
      </div>
      <svg className="absolute top-0 left-0 transform -rotate-90 w-14 h-14" viewBox="0 0 288 288">
        <circle
          cx="145"
          cy="145"
          r="120"
          stroke="currentColor"
          strokeWidth="10"
          fill="transparent"
          className={demandColors.container}
        />

        <circle
          cx="145"
          cy="145"
          r="120"
          stroke="currentColor"
          strokeWidth="10"
          fill="transparent"
          strokeDasharray={((2 * 22) / 7) * 120}
          strokeDashoffset={((2 * 22) / 7) * 120 - (((progress / 100) * 2 * 22) / 7) * 120}
          className={demandColors.bg}
        />
      </svg>
      <div className="text-white text-xxs absolute -bottom-5">Zone: {`${zone || 1}`}</div>
    </div>
  );
};

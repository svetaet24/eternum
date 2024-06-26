import React from "react";
import { OrderIcon } from "../../../../../elements/OrderIcon";
import useBlockchainStore from "../../../../../hooks/store/useBlockchainStore";
import ProgressBar from "../../../../../elements/ProgressBar";
import { formatSecondsLeftInDaysHours } from "../../labor/laborUtils";
import useUIStore from "../../../../../hooks/store/useUIStore";
import { getRealmNameById, getRealmOrderNameById } from "../../../../../utils/realms";
import { CombatInfo } from "@bibliothecadao/eternum";

type SelectRaidersProps = {
  selectedRaiders: CombatInfo[];
  attackingRaiders: CombatInfo[];
  setSelectedRaiders: (raiders: CombatInfo[]) => void;
};

export const SelectRaiders = ({ attackingRaiders, selectedRaiders, setSelectedRaiders }: SelectRaidersProps) => {
  const nextBlockTimestamp = useBlockchainStore((state) => state.nextBlockTimestamp);

  return (
    <div className={"w-full mt-2"}>
      {attackingRaiders
        .filter((raider) => {
          // either the ones that never moved or have arrived
          return nextBlockTimestamp
            ? raider.arrivalTime === undefined || raider.arrivalTime <= nextBlockTimestamp
            : false;
        })
        .map((raider, i) => (
          <SelectableRaider
            key={i}
            raider={raider}
            selectedRaiders={selectedRaiders}
            setSelectedRaiders={setSelectedRaiders}
          ></SelectableRaider>
        ))}
    </div>
  );
};

type SelectableRaiderProps = {
  raider: CombatInfo;
  selectedRaiders: CombatInfo[];
  setSelectedRaiders: (raiders: CombatInfo[]) => void;
} & React.HTMLAttributes<HTMLDivElement>;

export const SelectableRaider = ({ raider, selectedRaiders, setSelectedRaiders }: SelectableRaiderProps) => {
  const { entityId, health, quantity, attack, defence, originRealmId, arrivalTime } = raider;

  const nextBlockTimestamp = useBlockchainStore((state) => state.nextBlockTimestamp);
  const setTooltip = useUIStore((state) => state.setTooltip);

  const isTraveling = nextBlockTimestamp && arrivalTime ? arrivalTime > nextBlockTimestamp : false;
  const originRealmName = originRealmId ? getRealmNameById(originRealmId) : undefined;

  return (
    <div
      className={`flex cursor-pointer flex-col p-2 bg-black border border-gray-gold transition-all duration-200 rounded-md ${
        selectedRaiders.map((raider) => raider.entityId).includes(entityId) ? "!border-order-brilliance" : ""
      } text-xxs text-gold`}
      onClick={() => {
        if (!selectedRaiders.map((raider) => raider.entityId).includes(entityId)) {
          // add raider to selected raiders
          setSelectedRaiders([...selectedRaiders, raider]);
        } else {
          // remove raider from selected
          setSelectedRaiders(selectedRaiders.filter((raider) => raider.entityId !== entityId));
        }
      }}
    >
      <div className="flex items-center text-xxs">
        {entityId.toString() && (
          <div className="flex items-center p-1 -mt-2 -ml-2 italic border border-t-0 border-l-0 text-light-pink rounded-br-md border-gray-gold">
            #{entityId.toString()}
          </div>
        )}
        <div className="flex items-center ml-1 -mt-2">
          {isTraveling && originRealmId?.toString() && (
            <div className="flex items-center ml-1">
              <span className="italic text-light-pink">Traveling from</span>
              <div className="flex items-center ml-1 mr-1 text-gold">
                <OrderIcon order={getRealmOrderNameById(originRealmId)} className="mr-1" size="xxs" />
                {originRealmName}
                <span className="italic text-light-pink ml-1">with</span>
              </div>
            </div>
          )}
          {!isTraveling && originRealmId?.toString() && (
            <div className="flex items-center ml-1">
              <span className="italic text-light-pink">Arrived from</span>
              <div className="flex items-center ml-1 mr-1 text-gold">
                <OrderIcon order={getRealmOrderNameById(originRealmId)} className="mr-1" size="xxs" />
                {originRealmName}
              </div>
            </div>
          )}
        </div>
        {raider.arrivalTime && isTraveling && nextBlockTimestamp && (
          <div className="flex ml-auto -mt-2 italic text-light-pink">
            {formatSecondsLeftInDaysHours(raider.arrivalTime - nextBlockTimestamp)}
          </div>
        )}
      </div>
      <div className="flex flex-col mt-2 space-y-2">
        <div className="flex relative justify-between text-xxs text-lightest w-full">
          <div className="flex items-center">
            <div className="flex items-center h-6 mr-2">
              <img src="/images/units/troop-icon.png" className="h-[28px]" />
              <div className="flex ml-1 text-center">
                <div className="bold mr-1">x{quantity}</div>
                Raiders
              </div>
            </div>
          </div>
          <div className="flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center">
            <div
              className="flex items-center h-6 mr-2"
              onMouseEnter={() =>
                setTooltip({
                  position: "top",
                  content: (
                    <>
                      <p className="whitespace-nowrap">Attack power</p>
                    </>
                  ),
                })
              }
              onMouseLeave={() => setTooltip(null)}
            >
              <img src="/images/icons/attack.png" className="h-full" />
              <div className="flex flex-col ml-1 text-center">
                <div className="bold ">{attack}</div>
              </div>
            </div>
            <div
              className="flex items-center h-6 mr-2"
              onMouseEnter={() =>
                setTooltip({
                  position: "top",
                  content: (
                    <>
                      <p className="whitespace-nowrap">Defence power</p>
                    </>
                  ),
                })
              }
              onMouseLeave={() => setTooltip(null)}
            >
              <img src="/images/icons/defence.png" className="h-full" />
              <div className="flex flex-col ml-1 text-center">
                <div className="bold ">{defence}</div>
              </div>
            </div>
          </div>
          <div className="flex items-center">
            <div className="text-order-brilliance">{health && health.toLocaleString()}</div>&nbsp;/ {10 * quantity} HP
          </div>
        </div>
        {health && (
          <div className="grid grid-cols-12 gap-0.5">
            <ProgressBar
              containerClassName="col-span-12 !bg-order-giants"
              rounded
              progress={(health / (10 * quantity)) * 100}
            />
          </div>
        )}
      </div>
    </div>
  );
};

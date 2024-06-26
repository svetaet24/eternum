import clsx from "clsx";
import { ComponentPropsWithRef, useEffect, useMemo, useState } from "react";
import CircleButton from "../../elements/CircleButton";
import { OrderIcon } from "../../elements/OrderIcon";
import { Badge } from "../../elements/Badge";
import { RealmBadge } from "../../elements/RealmBadge";
import { useLocation } from "wouter";
import useRealmStore from "../../hooks/store/useRealmStore";
import { orderNameDict } from "@bibliothecadao/eternum";
import realmsNames from "../../geodata/realms.json";
import useUIStore from "../../hooks/store/useUIStore";
import { getRealm } from "../../utils/realms";
import { useDojo } from "../../DojoContext";
import { Has, HasValue, getComponentValue } from "@dojoengine/recs";
import { useEntityQuery } from "@dojoengine/react";
import { soundSelector, useUiSounds } from "../../hooks/useUISound";

type RealmSwitchProps = {} & ComponentPropsWithRef<"div">;

// TODO: Remove
export type RealmBubble = {
  id: bigint;
  realmId: bigint;
  name: string;
  order: string;
};

export const RealmSwitch = ({ className }: RealmSwitchProps) => {
  const {
    account: { account },
    setup: {
      components: { Realm, Owner },
    },
  } = useDojo();

  const [showRealms, setShowRealms] = useState(false);
  const [yourRealms, setYourRealms] = useState<RealmBubble[]>([]);

  const { realmEntityId, realmId, setRealmId, setRealmEntityId, realmEntityIds, setRealmEntityIds } = useRealmStore();

  const entityIds = useEntityQuery([Has(Realm), HasValue(Owner, { address: BigInt(account.address) })]);

  // set realm entity ids everytime the entity ids change
  useEffect(() => {
    let realmEntityIds = Array.from(entityIds)
      .map((id) => {
        const realm = getComponentValue(Realm, id);
        if (realm) {
          // const owner = getComponentValue(Owner, id);
          // console.log({ owner });
          return { realmEntityId: realm.entity_id, realmId: realm.realm_id };
        }
      })
      .filter(Boolean)
      .sort((a, b) => Number(a!.realmId) - Number(b!.realmId)) as { realmEntityId: bigint; realmId: bigint }[];

    setRealmEntityIds(realmEntityIds);
  }, [entityIds]);

  const setIsLoadingScreenEnabled = useUIStore((state) => state.setIsLoadingScreenEnabled);

  const [location, setLocation] = useLocation();

  const realm = useMemo(() => (realmId ? getRealm(realmId) : undefined), [realmId]);

  const { play: playFly } = useUiSounds(soundSelector.fly);

  useEffect(() => {
    if (location.includes("/map")) {
      setShowRealms(false);
    }
  }, [location]);

  const realms = useMemo(() => {
    const fetchedYourRealms: RealmBubble[] = [];
    realmEntityIds.forEach(({ realmEntityId, realmId }) => {
      const realm = getRealm(realmId);
      if (!realm) return;
      const name = realmsNames.features[Number(realm.realmId) - 1].name;
      fetchedYourRealms.push({
        id: realmEntityId,
        realmId: realm.realmId,
        name,
        order: orderNameDict[realm.order],
      });
    });
    return fetchedYourRealms;
  }, [realmEntityIds, realm]);

  useEffect(() => {
    setYourRealms(realms);
  }, [realms]);

  const orderName = useMemo(() => {
    let realmOrder = realm?.order || 1;
    return orderNameDict[realmOrder];
  }, [realmEntityId, realm]);

  return (
    <div className={clsx("flex", className)}>
      <CircleButton className={`bg-order-${orderName} text-gold`} size="md" onClick={() => setShowRealms(!showRealms)}>
        <OrderIcon
          order={orderName.toString()}
          withTooltip={false}
          size="xs"
          color={location.includes("/realm") ? "white" : "gold"}
        />
      </CircleButton>
      <div
        className={clsx(
          "flex items-center ml-2 space-x-2 w-auto transition-all duration-300 overflow-hidden rounded-xl",
          showRealms ? "max-w-[500px]" : "max-w-0",
        )}
      >
        {yourRealms.map((realm) => (
          // TODO: could not click on realm switch with the link
          <div
            key={realm.id}
            onClick={() => {
              setIsLoadingScreenEnabled(true);
              setTimeout(() => {
                if (location.includes(`/realm`)) {
                  setIsLoadingScreenEnabled(false);
                  playFly();
                }
                setLocation(`/realm/${Number(realm.realmId)}`);
                setRealmEntityId(realm.id);
                setRealmId(realm.realmId);
              }, 300);
            }}
          >
            <RealmBadge key={realm.id} realm={realm} active={realmEntityId === realm.id} />
          </div>
        ))}
      </div>
      {!showRealms && (
        <Badge size="lg" bordered className="absolute top-0 right-0 translate-x-1 -translate-y-2 text-xxs text-brown">
          {yourRealms.length}
        </Badge>
      )}
    </div>
  );
};

import { uuid } from "@latticexyz/utils";
import { ClientComponents } from "./createClientComponents";
import { getEntityIdFromKeys } from "../utils/utils";
import { Type, getComponentValue } from "@dojoengine/recs";
import { LABOR_CONFIG, Resource } from "@bibliothecadao/eternum";
import {
  CancelFungibleOrderProps,
  TransferItemsProps,
  CreateOrderProps,
  CreateRoadProps,
  HarvestLaborProps,
  PurchaseLaborProps,
  BuildLaborProps,
} from "@bibliothecadao/eternum";

export const HIGH_ENTITY_ID = 9999999999n;

export function createOptimisticSystemCalls({
  Trade,
  Status,
  Labor,
  ForeignKey,
  Resource,
  Road,
  DetachedResource,
  ResourceChest,
  Inventory,
}: ClientComponents) {
  function optimisticCreateOrder(systemCall: (args: any) => Promise<any>) {
    return async function (this: any, args: CreateOrderProps): Promise<void | number> {
      const {
        maker_id,
        maker_gives_resource_types,
        maker_gives_resource_amounts,
        maker_transport_id: transport_id,
        taker_id,
        taker_gives_resource_types,
        taker_gives_resource_amounts,
      } = args;

      const expires_at = Math.floor(Date.now() / 1000 + 2628000);

      // optimisitc rendering of trade
      const overrideId = uuid();
      const trade_id = getEntityIdFromKeys([BigInt(HIGH_ENTITY_ID)]);
      const maker_resource_chest_id = getEntityIdFromKeys([BigInt(HIGH_ENTITY_ID + 1n)]);
      const taker_resource_chest_id = getEntityIdFromKeys([BigInt(HIGH_ENTITY_ID + 2n)]);
      const maker_transport_id = transport_id || getEntityIdFromKeys([BigInt(HIGH_ENTITY_ID + 3n)]);
      // const key = getEntityIdFromKeys([BigInt(HIGH_ENTITY_ID + 4)]);

      Trade.addOverride(overrideId, {
        entity: trade_id,
        value: {
          maker_id: BigInt(maker_id),
          taker_id: BigInt(taker_id),
          maker_resource_chest_id: BigInt(maker_resource_chest_id),
          taker_resource_chest_id: BigInt(taker_resource_chest_id),
          maker_transport_id: BigInt(maker_transport_id),
          expires_at,
        },
      });
      Status.addOverride(overrideId, {
        entity: trade_id,
        value: { value: 0n },
      });
      ResourceChest.addOverride(overrideId, {
        entity: maker_resource_chest_id,
        value: { resources_count: maker_gives_resource_types.length },
      });
      ResourceChest.addOverride(overrideId, {
        entity: taker_resource_chest_id,
        value: { resources_count: taker_gives_resource_types.length },
      });
      for (let i = 0; i < maker_gives_resource_amounts.length; i++) {
        DetachedResource.addOverride(overrideId, {
          entity: getEntityIdFromKeys([BigInt(maker_resource_chest_id), BigInt(i)]),
          value: {
            resource_type: maker_gives_resource_types[i] as Type.Number,
            resource_amount: BigInt(maker_gives_resource_amounts[i]),
          },
        });
      }
      for (let i = 0; i < taker_gives_resource_amounts.length; i++) {
        DetachedResource.addOverride(overrideId, {
          entity: getEntityIdFromKeys([BigInt(taker_resource_chest_id), BigInt(i)]),
          value: {
            resource_type: taker_gives_resource_types[i] as Type.Number,
            resource_amount: BigInt(taker_gives_resource_amounts[i]),
          },
        });
      }

      try {
        return systemCall(args);
      } finally {
        Trade.removeOverride(overrideId);
        Status.removeOverride(overrideId);
      }
    };
  }

  // note: claim fungible order is actually transferring from the resourceschest to the realm
  function optimisticOffloadResources(
    resourcesGet: Resource[],
    systemCall: (args: TransferItemsProps) => Promise<void>,
  ) {
    return async function (this: any, args: TransferItemsProps) {
      const { receiver_id: receiving_entity_id, indices, sender_id: transport_id } = args;

      const resources_chest_ids = indices
        .map((index) => {
          let inventory = getComponentValue(Inventory, getEntityIdFromKeys([BigInt(transport_id)]));
          let foreignKey = inventory
            ? getComponentValue(
                ForeignKey,
                getEntityIdFromKeys([BigInt(transport_id), BigInt(inventory.items_key), BigInt(index)]),
              )
            : undefined;
          return foreignKey?.entity_id;
        })
        .filter(Boolean) as bigint[];

      let overrideId = uuid();

      // remove resources from inventory
      Inventory.addOverride(overrideId, {
        entity: getEntityIdFromKeys([BigInt(transport_id)]),
        value: {
          items_count: 0n,
        },
      });

      resources_chest_ids.forEach((resources_chest_id) => {
        // remove resources from chest
        ResourceChest.addOverride(overrideId, {
          entity: getEntityIdFromKeys([BigInt(resources_chest_id)]),
          value: {
            resources_count: 0,
          },
        });
      });

      // add resources to balance
      for (let resource of resourcesGet) {
        let resource_id = getEntityIdFromKeys([BigInt(receiving_entity_id), BigInt(resource.resourceId)]);
        let currentResource = getComponentValue(Resource, resource_id) || {
          balance: 0n,
        };
        let balance = currentResource.balance + BigInt(resource.amount);
        Resource.addOverride(overrideId + resource.resourceId, {
          entity: resource_id,
          value: {
            balance,
          },
        });
      }

      try {
        await systemCall(args);
      } finally {
        Trade.removeOverride(overrideId);
        for (let resource of resourcesGet) {
          Resource.removeOverride(overrideId + resource.resourceId);
        }
      }
    };
  }

  function optimisticAcceptOffer(tradeId: bigint, takerId: bigint, systemCall: () => Promise<void>) {
    return async function (this: any) {
      const overrideId = uuid();
      let trade_id = getEntityIdFromKeys([BigInt(tradeId)]);
      let taker_id = getEntityIdFromKeys([BigInt(takerId)]);
      // change status from open to accepted
      Status.addOverride(overrideId, {
        entity: trade_id,
        value: { value: 1n },
      });
      // change trade taker_id to realm
      Trade.addOverride(overrideId, {
        entity: trade_id,
        value: { taker_id: BigInt(taker_id) },
      });

      // TODO: remove resources from the realm balance

      try {
        await systemCall(); // Call the original function with its arguments and correct context
      } finally {
        // remove overrides
        Status.removeOverride(overrideId);
        Trade.removeOverride(overrideId);
      }
    };
  }

  function optimisticCancelOffer(systemCall: (args: CancelFungibleOrderProps) => Promise<void>) {
    return async function (this: any, args: CancelFungibleOrderProps) {
      const { trade_id: tradeId } = args;

      const overrideId = uuid();
      let trade_id = getEntityIdFromKeys([BigInt(tradeId)]);
      // change status from open to accepted
      Status.addOverride(overrideId, {
        entity: trade_id,
        value: { value: 2n },
      });

      try {
        await systemCall(args); // Call the original function with its arguments and correct context
      } finally {
        // remove overrides
        Status.removeOverride(overrideId);
      }
    };
  }

  function optimisticBuildLabor(
    ts: number,
    costResources: Resource[],
    laborAuctionAverageCoefficient: number,
    systemCall: (args: PurchaseLaborProps & BuildLaborProps) => Promise<void>,
  ) {
    return async function (this: any, args: PurchaseLaborProps & BuildLaborProps) {
      const { entity_id: realmEntityId, resource_type: resourceId, labor_units: laborUnits, multiplier } = args;

      const overrideId = uuid();
      const resource_id = getEntityIdFromKeys([BigInt(realmEntityId), BigInt(resourceId)]);

      for (let i = 0; i < costResources.length; i++) {
        let costId = getEntityIdFromKeys([BigInt(realmEntityId), BigInt(costResources[i].resourceId)]);
        let currentResource = getComponentValue(Resource, costId) || {
          balance: 0n,
        };
        let balance =
          Number(currentResource.balance) -
          Math.floor(
            (laborUnits as number) * (multiplier as number) * costResources[i].amount * laborAuctionAverageCoefficient,
          );
        Resource.addOverride(overrideId + i, {
          entity: costId,
          value: {
            balance: BigInt(balance),
          },
        });
      }

      // compute new values
      let labor = getComponentValue(Labor, resource_id) || {
        balance: ts,
        last_harvest: ts,
        multiplier: 1,
      };

      let additional_labor = (laborUnits as number) * LABOR_CONFIG.base_labor_units;
      let new_balance: number = labor.balance;
      let new_last_harvest: number = labor.last_harvest;
      if (labor.balance <= ts) {
        new_last_harvest += ts - labor.balance;
        new_balance = ts + additional_labor;
      } else {
        new_balance += additional_labor;
      }

      Labor.addOverride(overrideId, {
        entity: resource_id,
        value: {
          multiplier: multiplier as number,
          balance: new_balance,
          last_harvest: new_last_harvest,
        },
      });

      try {
        await systemCall(args); // Call the original function with its arguments and correct context
      } finally {
        // remove overrides
        Labor.removeOverride(overrideId);
        // remove resource overrides
        for (let i = 0; i < costResources.length; i++) {
          Resource.removeOverride(overrideId + i);
        }
      }
    };
  }

  function optimisticHarvestLabor(
    ts: number,
    levelBonus: number,
    hyperstructureLevelBonus: number,
    systemCall: (args: HarvestLaborProps) => Promise<void>,
  ) {
    return async function (this: any, args: HarvestLaborProps) {
      const { realm_id, resource_type } = args;

      const overrideId = uuid();
      const resource_id = getEntityIdFromKeys([BigInt(realm_id), BigInt(resource_type)]);

      // compute new values
      let labor = getComponentValue(Labor, resource_id) || {
        balance: ts,
        last_harvest: ts,
        multiplier: 1,
      };
      let laborGenerated = labor.balance <= ts ? labor.balance - labor.last_harvest : ts - labor.last_harvest;
      let laborUnharvested = labor.balance <= ts ? 0 : labor.balance - ts;
      let laborUnitsGenerated = Math.floor(laborGenerated / LABOR_CONFIG.base_labor_units);
      let remainder = laborGenerated - laborUnitsGenerated * LABOR_CONFIG.base_labor_units;
      const balance = ts + remainder + laborUnharvested;
      const isFood = resource_type === 255 || resource_type === 254 ? true : false;

      Labor.addOverride(overrideId, {
        entity: resource_id,
        value: {
          multiplier: labor.multiplier,
          balance,
          last_harvest: ts,
        },
      });

      let currentResource = getComponentValue(Resource, resource_id) || {
        balance: 0n,
      };
      let resourceBalance = isFood
        ? (laborUnitsGenerated *
            LABOR_CONFIG.base_food_per_cycle *
            labor.multiplier *
            levelBonus *
            hyperstructureLevelBonus) /
          10000
        : (laborUnitsGenerated * LABOR_CONFIG.base_resources_per_cycle * levelBonus * hyperstructureLevelBonus) / 10000;
      Resource.addOverride(overrideId, {
        entity: resource_id,
        value: {
          balance: BigInt(resourceBalance) + currentResource.balance,
        },
      });

      try {
        await systemCall(args); // Call the original function with its arguments and correct context
      } finally {
        // remove overrides
        Labor.removeOverride(overrideId);
        Resource.removeOverride(overrideId);
      }
    };
  }

  function optimisticBuildRoad(costResources: Resource[], systemCall: (args: CreateRoadProps) => Promise<void>) {
    return async function (this: any, args: CreateRoadProps) {
      const { creator_id, start_coord, end_coord, usage_count } = args;
      const overrideId = uuid();
      // change status from open to accepted
      let usageCount = usage_count as Type.Number;
      Road.addOverride(overrideId, {
        entity: getEntityIdFromKeys([
          BigInt(start_coord.x),
          BigInt(start_coord.y),
          BigInt(end_coord.x),
          BigInt(end_coord.y),
        ]),
        value: { usage_count: usageCount },
      });

      for (let i = 0; i < costResources.length; i++) {
        let costId = getEntityIdFromKeys([BigInt(creator_id), BigInt(costResources[i].resourceId)]);
        let currentResource = getComponentValue(Resource, costId) || {
          balance: 0n,
        };
        let balance = Number(currentResource.balance) - costResources[i].amount;
        Resource.addOverride(overrideId + i, {
          entity: costId,
          value: {
            balance: BigInt(balance),
          },
        });
      }

      try {
        await systemCall(args); // Call the original function with its arguments and correct context
      } finally {
        // remove overrides
        Road.removeOverride(overrideId);
        for (let i = 0; i < costResources.length; i++) {
          Resource.removeOverride(overrideId + i);
        }
      }
    };
  }

  return {
    optimisticOffloadResources,
    optimisticCreateOrder,
    optimisticAcceptOffer,
    optimisticCancelOffer,
    optimisticBuildLabor,
    optimisticHarvestLabor,
    optimisticBuildRoad,
  };
}

#[system]
mod CancelFungibleOrder {
    use eternum::components::owner::Owner;
    use eternum::components::trade::{Trade, Status, TradeStatus};

    use eternum::systems::order::helpers::order;

    use box::BoxTrait;
    use traits::Into;

    use dojo::world::Context;

    fn execute(ctx: Context, trade_id: u128) {

        let (trade_meta, trade_status) = get!(ctx.world, trade_id, (Trade, Status));
        let owner = get!(ctx.world, trade_meta.maker_id, Owner);

        assert(owner.address == ctx.origin, 'caller must be trade maker');
        assert(trade_status.value == TradeStatus::OPEN, 'trade must be open');

        // return resources back to maker
        order::resource::give(ctx.world, trade_meta.maker_order_id, trade_meta.maker_id);
  
        let maker_caravan = order::caravan::get(ctx.world, trade_meta.maker_order_id, trade_meta.maker_id);
        if  maker_caravan.caravan_id != 0 {
            order::caravan::detach(ctx.world, maker_caravan);
        }

        let taker_caravan = order::caravan::get(ctx.world, trade_meta.taker_order_id, trade_meta.taker_id);
        if  taker_caravan.caravan_id != 0 {
            order::caravan::detach(ctx.world, taker_caravan);
        }
        
        order::cancel(ctx.world, trade_id);
    }

}


#[cfg(test)]
mod tests {
    use eternum::components::resources::Resource;
    use eternum::components::trade::FungibleEntities;
    use eternum::components::owner::Owner;
    use eternum::components::movable::Movable;
    use eternum::components::trade::{Trade, Status, TradeStatus, OrderResource};
    use eternum::systems::order::helpers::order;


    use eternum::constants::ResourceTypes;

    use eternum::utils::testing::spawn_eternum;

    use traits::Into;
    use result::ResultTrait;
    use array::ArrayTrait;
    use serde::Serde;
    
    use starknet::contract_address_const;

    use dojo::world::{ IWorldDispatcher, IWorldDispatcherTrait};


    fn setup(trade_status: u128) -> (IWorldDispatcher, u128, u64, u128, u64, u128) {
        let world = spawn_eternum();

        starknet::testing::set_contract_address(world.executor());

        let maker_id = 11_u64;
        let taker_id = 12_u64;

        set!(world, (Owner { entity_id: maker_id.into(), address: contract_address_const::<'maker'>()}));
        set!(world, (Owner { entity_id: taker_id.into(), address: contract_address_const::<'taker'>()}));

        // create resources for maker
        set!(world, (
            Resource { 
                entity_id: maker_id.into(), 
                resource_type: ResourceTypes::STONE,
                balance: 400 
            }
        ));
        set!(world, (
            Resource { 
                entity_id: maker_id.into(), 
                resource_type: ResourceTypes::GOLD, 
                balance: 100 
            }
        ));



        // create a trade  
        let trade_id = 10_u128;
        let maker_order_id = 13_u128;
        let taker_order_id = 14_u128;
        set!(world, (
            Trade {
                trade_id,
                maker_id: maker_id.into(),
                taker_id: taker_id.into(),
                maker_order_id: maker_order_id,
                taker_order_id: taker_order_id,
                expires_at: 100,
                claimed_by_maker: false,
                claimed_by_taker: false,
                taker_needs_caravan: false
            },
            Status {
                 trade_id, 
                 value: trade_status
            }
        ));


        // set fungible entities for maker
        set!(world, (FungibleEntities { entity_id: maker_order_id, count: 2, key: 33}));
        set!(world, (
            OrderResource { 
                order_id: maker_order_id,
                fungible_entities_id: 33,
                index: 0,
                resource_type: ResourceTypes::STONE,
                balance: 100
            }
        ));
        set!(world, (
            OrderResource { 
                order_id: maker_order_id,
                fungible_entities_id: 33,
                index: 1,
                resource_type: ResourceTypes::GOLD,
                balance: 200
            }
        ));

        (world, trade_id, maker_id, maker_order_id, taker_id, taker_order_id)
    }



    #[test]
    #[available_gas(3000000000000)]
    fn test_cancel_order_without_caravan() {

        let (world, trade_id, maker_id, maker_order_id, taker_id, taker_order_id) 
            = setup(TradeStatus::OPEN);

        // cancel order
        starknet::testing::set_contract_address(contract_address_const::<'maker'>());
        let mut calldata = array![];
        Serde::serialize(@trade_id, ref calldata);
        world.execute('CancelFungibleOrder', calldata);


        let trade_status = get!(world, trade_id, Status);
        assert(trade_status.value == TradeStatus::CANCELLED, 'trade must be cancelled');

        let maker_stone_resource = get!(world, (maker_id, ResourceTypes::STONE), Resource);
        assert(maker_stone_resource.balance == 500, 'maker must have 500 stone'); // 400 + 100

        let maker_gold_resource = get!(world, (maker_id, ResourceTypes::GOLD), Resource);
        assert(maker_gold_resource.balance == 300, 'maker must have 300 gold'); // 100 + 200

    }



    #[test]
    #[available_gas(3000000000000)]  
    fn test_cancel_order_with_caravan() {
            
        let (world, trade_id, maker_id, maker_order_id, taker_id, taker_order_id) 
            = setup(TradeStatus::OPEN);
            
        // create caravan for maker
        let maker_caravan_id = 20_u128;
        let maker_caravan_id_felt: felt252 = maker_caravan_id.into();
        set!(world, (Owner { address: contract_address_const::<'maker'>(), entity_id: maker_caravan_id.into()}));
        set!(world, (Movable { sec_per_km: 10, blocked: false, entity_id: maker_caravan_id.into()}));

        // create caravan for taker
        let taker_caravan_id = 21_u128;
        let taker_caravan_id_felt: felt252 = taker_caravan_id.into();
        set!(world, (Owner { address: contract_address_const::<'taker'>(), entity_id: taker_caravan_id.into()}));
        set!(world, (Movable { sec_per_km: 10, blocked: false, entity_id: taker_caravan_id.into()}));

        // attach both caravans to trade order
        order::caravan::attach(world, maker_caravan_id, maker_order_id, maker_id.into());
        order::caravan::attach(world, taker_caravan_id, taker_order_id, taker_id.into());


        // cancel order
        starknet::testing::set_contract_address(contract_address_const::<'maker'>());
        let mut calldata = array![];
        Serde::serialize(@trade_id, ref calldata);
        world.execute('CancelFungibleOrder', calldata);


        let trade_status = get!(world, trade_id, Status);
        assert(trade_status.value == TradeStatus::CANCELLED, 'trade must be cancelled');

        // check maker resource values

        let maker_stone_resource = get!(world, (maker_id, ResourceTypes::STONE), Resource);
        assert(maker_stone_resource.balance == 500, 'maker must have 500 stone'); // 400 + 100

        let maker_gold_resource = get!(world, (maker_id, ResourceTypes::GOLD), Resource);
        assert(maker_gold_resource.balance == 300, 'maker must have 300 gold'); // 100 + 200

        // check maker caravan properties
        let maker_order_caravan = order::caravan::get(world, maker_order_id, maker_id.into());
        assert(maker_order_caravan.caravan_id == 0, 'order must not have caravan');

        let maker_caravan_movable = get!(world, maker_caravan_id, Movable); 
        assert(maker_caravan_movable.blocked == false, 'caravan must not be blocked');

        // check taker caravan properties
        let taker_order_caravan = order::caravan::get(world, taker_order_id, taker_id.into());
        assert(taker_order_caravan.caravan_id == 0, 'order must not have caravan');

        let taker_caravan_movable = get!(world, taker_caravan_id, Movable);
        assert(taker_caravan_movable.blocked == false, 'caravan must not be blocked');        
    }



    #[test]
    #[available_gas(3000000000000)]  
    #[should_panic(expected: ('trade must be open','ENTRYPOINT_FAILED','ENTRYPOINT_FAILED','ENTRYPOINT_FAILED' ))]
    fn test_wrong_status(){

        let (world, trade_id, _, _, _, _) = setup(TradeStatus::ACCEPTED);

        // cancel order
        starknet::testing::set_contract_address(contract_address_const::<'maker'>());
        let mut calldata = array![];
        Serde::serialize(@trade_id, ref calldata);
        world.execute('CancelFungibleOrder', calldata);
    }



    #[test]
    #[available_gas(3000000000000)]
    #[should_panic(expected: ('caller must be trade maker','ENTRYPOINT_FAILED','ENTRYPOINT_FAILED','ENTRYPOINT_FAILED' ))]
    fn test_not_maker() {

        let (world, trade_id, _, _, _, _) = setup(TradeStatus::ACCEPTED);

        // cancel order
        // set some unknown address as caller
        starknet::testing::set_contract_address(contract_address_const::<'unknown'>());
        let mut calldata = array![];
        Serde::serialize(@trade_id, ref calldata);
        world.execute('CancelFungibleOrder', calldata);
    }
}
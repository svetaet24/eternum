#[system]
mod BuildLabor {
    use traits::Into;
    use traits::TryInto;
    use array::ArrayTrait;
    use eternum::components::config::WorldConfig;
    use eternum::components::realm::Realm;
    use eternum::components::realm::RealmTrait;
    use eternum::components::resources::Resource;
    use eternum::components::labor::Labor;
    use eternum::components::labor::LaborTrait;
    use eternum::components::config::LaborConf;
    use eternum::components::config::LaborCR;
    use eternum::components::config::LaborCV;
    use starknet::ContractAddress;
    use eternum::constants::WORLD_CONFIG_ID;
    use eternum::constants::LABOR_CONFIG_ID;
    use eternum::constants::ResourceIds;
    use eternum::utils::convert::convert_u64_to_u128;
    use eternum::utils::convert::convert_u8_to_u128;
    use eternum::utils::unpack::unpack_resource_ids;

    use debug::PrintTrait;

    #[external]
    fn execute(realm_id: felt252, resource_id: u8, labor_units: u128, multiplier: u128) {
        // assert owner of realm
        let player_id: ContractAddress = starknet::get_caller_address();
        let realm: Realm = commands::<Realm>::entity(realm_id.into());
        assert(realm.owner == player_id, 'Realm does not belong to player');

        // check that resource is on realm
        assert(realm.has_resource(resource_id) == true, 'Resource is not on realm');

        // Get Config
        let labor_config: LaborConf = commands::<LaborConf>::entity(LABOR_CONFIG_ID.into());

        // transform timestamp from u64 to u128
        let ts: u128 = convert_u64_to_u128(starknet::get_block_timestamp());

        let resource_id_felt: felt252 = resource_id.into();
        let resource_query: Query = (realm_id, resource_id_felt).into();
        // get labor
        let maybe_labor = commands::<Labor>::try_entity(resource_query);
        let labor = match maybe_labor {
            Option::Some(labor) => labor,
            Option::None(_) => Labor { balance: 0, last_harvest: ts, multiplier: 1,  },
        };

        // config
        let additionnal_labor = labor_units * labor_config.base_labor_units;

        // set new labor balance
        let new_labor_balance = labor.get_new_labor_balance(additionnal_labor, ts);

        // assert multiplier higher than 0
        assert(multiplier > 0, 'Multiplier cannot be zero');

        // if multiplier is bigger than 1, verify that it's either fish or wheat 
        // assert ressource_id is fish or wheat
        if multiplier > 1 {
            if resource_id == ResourceIds::FISH {
                // assert that realm can have that many fishing villages
                let harbors: u128 = convert_u8_to_u128(realm.harbors);
                assert(harbors >= multiplier, 'Not enough harbors')
            } else {
                assert(resource_id == ResourceIds::WHEAT, 'Resource id is not valid');
                // assert that realm can have that many farms
                let rivers: u128 = convert_u8_to_u128(realm.rivers);
                assert(rivers >= multiplier, 'Not enough rivers')
            }
        }

        let maybe_current_resource = commands::<Resource>::try_entity(resource_query);

        // since we might harvest, check current resources
        let mut current_resource = match maybe_current_resource {
            Option::Some(current_resource) => {
                current_resource
            },
            Option::None(_) => {
                Resource { id: resource_id, balance: 0 }
            },
        };
        // if multiplier is different than previous multiplier, you need to harvest unharvested
        if multiplier != labor.multiplier { // get what has not been harvested and what will be harvested in the future
            let (labor_generated, is_complete, labor_unharvested) = labor.get_labor_generated(ts);
            let mut total_harvest = 0;
            if (is_complete == false) { // divide the unharvested resources by 4 and add them to the balance
                total_harvest = labor_generated + labor_unharvested / 4;
            } else {
                total_harvest = labor_generated;
            }
            let total_harvest_units = total_harvest
                / labor_config.base_labor_units; // get current resource
            // add these resources to balance
            commands::<Resource>::set_entity(
                resource_query,
                (Resource {
                    id: current_resource.id,
                    balance: current_resource.balance
                        + (total_harvest_units
                            * labor.multiplier
                            * labor_config.base_resources_per_cycle)
                })
            );
        }

        // update the labor
        commands::set_entity(
            resource_query,
            (Labor {
                balance: new_labor_balance,
                last_harvest: labor.last_harvest,
                multiplier: multiplier,
            }),
        );

        // pay for labor 
        let labor_cost_resources = commands::<LaborCR>::entity(resource_id_felt.into());
        let labor_cost_resource_ids: Array<u8> = unpack_resource_ids(
            labor_cost_resources.resource_ids_packed, labor_cost_resources.resource_ids_count
        );

        let mut index = 0_usize;
        loop {
            if index == labor_cost_resources.resource_ids_count.into() {
                break ();
            }
            let labor_cost_resource_id: felt252 = (*labor_cost_resource_ids[index]).into();
            let resource_query = (resource_id_felt, labor_cost_resource_id).into();
            let labor_cost_per_unit = commands::<LaborCV>::entity(resource_query);
            let current_resource: Resource = commands::<Resource>::entity(resource_query);
            let total_cost = labor_cost_per_unit.value * labor_units * multiplier;
            assert(current_resource.balance >= total_cost, 'Not enough resources');
            commands::<Resource>::set_entity(
                resource_query,
                (Resource {
                    id: current_resource.id, balance: current_resource.balance - total_cost
                })
            );
            index += 1;
        };
    }
}


#[system]
mod HarvestLabor {
    use traits::Into;
    use array::ArrayTrait;
    use traits::TryInto;
    use debug::PrintTrait;
    use integer::u128_safe_divmod;

    use eternum::components::config::WorldConfig;
    use eternum::components::realm::Realm;
    use eternum::components::realm::RealmTrait;
    use eternum::components::resources::Resource;
    use eternum::components::resources::Vault;
    use eternum::components::labor::Labor;
    use eternum::components::labor::LaborTrait;
    use eternum::components::config::LaborConf;
    use starknet::ContractAddress;
    use eternum::constants::WORLD_CONFIG_ID;
    use eternum::constants::LABOR_CONFIG_ID;
    use eternum::utils::convert::convert_u64_to_u128;
    use eternum::utils::convert::convert_u8_to_u128;
    use eternum::constants::ResourceIds;

    fn execute(realm_id: felt252, resource_id: u8) {
        let player_id: ContractAddress = starknet::get_caller_address();
        let realm: Realm = commands::<Realm>::entity(realm_id.into());

        // Check owner of s_realm
        assert(realm.owner == player_id, 'Realm does not belong to player');

        // Check resource on Realm
        assert(realm.has_resource(resource_id) == true, 'Resource is not on realm');

        // Get Config
        let labor_config: LaborConf = commands::<LaborConf>::entity(LABOR_CONFIG_ID.into());

        let resource_id_felt: felt252 = resource_id.into();
        let resource_query: Query = (realm_id, resource_id_felt).into();
        let maybe_labor = commands::<Labor>::try_entity(resource_query);
        let labor = match maybe_labor {
            Option::Some(labor) => labor,
            Option::None(_) => Labor { balance: 0, last_harvest: 0, multiplier: 1,  }
        };
        let maybe_resource = commands::<Resource>::try_entity(resource_query);
        let resource = match maybe_resource {
            Option::Some(resource) => resource,
            Option::None(_) => Resource { id: resource_id, balance: 0,  }
        };

        // transform timestamp from u64 to u128
        let ts: u128 = convert_u64_to_u128(starknet::get_block_timestamp());

        // generated labor
        let (labor_generated, _, _) = labor.get_labor_generated(ts);

        // assert base labor units not zero
        assert(labor_config.base_labor_units != 0, 'Base labor units cannot be zero');

        // labor units and part units
        let mut labor_units_generated = labor_generated / labor_config.base_labor_units;
        let rest = labor_generated % labor_config.base_labor_units;

        // remove the vault
        // get vault for that resource
        // let is_not_fish = ;
        // let is_not_wheat = ;
        let maybe_vault = commands::<Vault>::try_entity(resource_query);
        let vault = match maybe_vault {
            Option::Some(vault) => {
                vault
            },
            Option::None(_) => {
                Vault { balance: 0 }
            },
        };
        if resource_id != ResourceIds::FISH
            & resource_id != ResourceIds::WHEAT {
                // remove 25% to the vault
                let vault_units_generated = (labor_units_generated * labor_config.vault_percentage)
                    / 1000;
                labor_units_generated = labor_units_generated - vault_units_generated;

                // the balance in the vault is in cycles so need to multiply by base resource per cycle
                // update the vault
                commands::set_entity(
                    resource_query, (Vault { balance: vault.balance + vault_units_generated }, )
                );
            }

        // update the labor and resources
        commands::set_entity(
            resource_query,
            (
                Resource {
                    id: resource_id,
                    balance: resource.balance
                        + labor_units_generated * labor_config.base_resources_per_cycle
                    }, Labor {
                    balance: labor.balance + rest, last_harvest: ts, multiplier: labor.multiplier, 
                }
            )
        );
    }
}
// TODO: cannot use Pillage yet because of cairo error :
// #13661->#13662: Got 'Unknown ap change' error while moving [79]
// wait for it to be solved
// #[system]
// mod Pillage {
//     use traits::Into;
//     use array::ArrayTrait;

//     use eternum::components::config::WorldConfig;
//     use eternum::components::realm::Realm;
//     use eternum::components::realm::RealmTrait;
//     use eternum::components::resources::Resource;
//     use eternum::components::resources::Vault;
//     use eternum::components::labor::Labor;
//     use eternum::components::labor::LaborTrait;
//     use eternum::components::config::LaborConf;
//     use starknet::ContractAddress;
//     // todo need better way to store resources
//     use eternum::constants::WORLD_CONFIG_ID;
//     use eternum::constants::LABOR_CONFIG_ID;
//     use eternum::utils::convert::convert_u64_to_u128;
//     use eternum::utils::unpack::unpack_resource_ids;
//     use integer::u128_safe_divmod;
//     // 2. check ressources on realm
//     // 3. get_raidable => 25% of vault balance for each resource, as base labor units (86400 / 12)

//     #[external]
//     fn execute(realm_id: felt252, attacker: ContractAddress) {
//         // get all resources that are raidable
//         let pillaged_realm = commands::<Realm>::entity(realm_id.into());
//         let resource_ids: Array<u256> = unpack_resource_ids(
//             pillaged_realm.resource_ids_packed, pillaged_realm.resource_ids_count
//         );
//         let resource_ids_count = pillaged_realm.resource_ids_count;

//         //TODO: check if caller can pillage

//         let mut index = 0_usize;
//         // commands:: not working in loops for now
//         // loop {
//         if index == resource_ids_count { // break ();
//         }
//         // get 25% of the resource id in the vault
//         let resource_id: felt252 = (*resource_ids[index]).low.into();
//         let maybe_vault = commands::<Vault>::try_entity((realm_id, (resource_id)).into());
//         match maybe_vault {
//             Option::Some(vault) => {
//                 let mut pillaged_amount = vault.balance / 4;
//                 // only pillage if enough in the vault
//                 if pillaged_amount < vault.balance {
//                     // if not enough take all
//                     pillaged_amount = vault.balance;
//                 }
//                 commands::set_entity(
//                     (realm_id, (resource_id)).into(),
//                     (Vault { balance: vault.balance - pillaged_amount }),
//                 );
//                 let attacker_resources = commands::<Resource>::entity(
//                     (attacker.into(), (resource_id)).into()
//                 ); // add these resources to the pillager
//                 commands::set_entity(
//                     (attacker.into(), (resource_id)).into(),
//                     (Resource {
//                         id: resource_id, balance: attacker_resources.balance + (pillaged_amount * labor_config.base_resources_per_cycle)
//                     }),
//                 );
//             },
//             Option::None(_) => {},
//         }
//         index += 1_usize;
//     // }
//     }
// }



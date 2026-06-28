import os
import json
import joblib
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestRegressor
from sklearn.tree import DecisionTreeRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, root_mean_squared_error, r2_score

def train_pipeline():
    print("Starting Multi-Model Training Pipeline...")
    
    # 1. Load raw dataset
    csv_path = "Banglore_traffic_Dataset_raw.csv"
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Dataset not found at {csv_path}")
        
    df = pd.read_csv(csv_path)
    print(f"Dataset loaded successfully. Shape: {df.shape}")
    
    # 2. Data Cleaning & Feature Engineering
    df['Date'] = pd.to_datetime(df['Date'])
    df['Day_of_Week'] = df['Date'].dt.dayofweek
    df['Month'] = df['Date'].dt.month
    
    # Define features
    categorical_cols = ['Area Name', 'Road/Intersection Name', 'Weather Conditions', 'Roadwork and Construction Activity']
    numeric_cols = ['Traffic Volume', 'Incident Reports', 'Pedestrian and Cyclist Count', 'Day_of_Week', 'Month']
    
    targets = ['Congestion Level', 'Average Speed', 'Travel Time Index', 'Road Capacity Utilization']
    
    X = df[categorical_cols + numeric_cols]
    Y = df[targets]
    
    # 3. Split into Train & Test sets
    X_train, X_test, Y_train, Y_test = train_test_split(X, Y, test_size=0.2, random_state=42)
    print(f"Train size: {X_train.shape[0]}, Test size: {X_test.shape[0]}")
    
    # 4. Create Preprocessing Pipeline
    categorical_transformer = Pipeline(steps=[
        ('onehot', OneHotEncoder(handle_unknown='ignore', sparse_output=False))
    ])
    
    numeric_transformer = Pipeline(steps=[
        ('scaler', StandardScaler())
    ])
    
    preprocessor = ColumnTransformer(
        transformers=[
            ('cat', categorical_transformer, categorical_cols),
            ('num', numeric_transformer, numeric_cols)
        ]
    )
    
    # Create directory for model assets
    assets_dir = "model_assets"
    os.makedirs(assets_dir, exist_ok=True)
    
    # 5. Define Model Architectures to Compare
    model_architectures = {
        'Random Forest': lambda: RandomForestRegressor(n_estimators=50, max_depth=12, min_samples_split=4, random_state=42, n_jobs=-1),
        'Decision Tree': lambda: DecisionTreeRegressor(max_depth=10, min_samples_split=4, random_state=42),
        'Linear Regression': lambda: LinearRegression()
    }
    
    # Fit preprocessor on training data to get transformed feature names for weights
    preprocessor.fit(X_train)
    cat_encoder = preprocessor.named_transformers_['cat'].named_steps['onehot']
    cat_features = list(cat_encoder.get_feature_names_out(categorical_cols))
    all_feature_names = cat_features + numeric_cols
    
    # Dictionary to hold nested pipelines: pipelines[model_name][target_name]
    pipelines = {model_name: {} for model_name in model_architectures.keys()}
    metrics = {model_name: {} for model_name in model_architectures.keys()}
    feature_importances = {model_name: {} for model_name in ['Random Forest', 'Decision Tree']}
    
    # Train each model architecture
    for model_name, model_instantiator in model_architectures.items():
        print(f"\n--- Training Model Architecture: {model_name} ---")
        
        for target in targets:
            print(f"Training for target: {target}...")
            
            # Build individual pipeline
            model_pipeline = Pipeline(steps=[
                ('preprocessor', preprocessor),
                ('regressor', model_instantiator())
            ])
            
            # Fit model
            model_pipeline.fit(X_train, Y_train[target])
            pipelines[model_name][target] = model_pipeline
            
            # Predict & Evaluate
            y_pred = model_pipeline.predict(X_test)
            mae = mean_absolute_error(Y_test[target], y_pred)
            rmse = root_mean_squared_error(Y_test[target], y_pred)
            r2 = r2_score(Y_test[target], y_pred)
            
            metrics[model_name][target] = {
                "MAE": round(float(mae), 4),
                "RMSE": round(float(rmse), 4),
                "R2": round(float(r2), 4)
            }
            
            # Extract Feature Importance (only for Tree-based models)
            if model_name in ['Random Forest', 'Decision Tree']:
                regressor = model_pipeline.named_steps['regressor']
                importances = regressor.feature_importances_
                
                # Group feature importances back to original columns
                grouped_importances = {
                    'Area Name': 0.0,
                    'Road/Intersection Name': 0.0,
                    'Weather Conditions': 0.0,
                    'Roadwork and Construction Activity': 0.0,
                    'Traffic Volume': 0.0,
                    'Incident Reports': 0.0,
                    'Pedestrian and Cyclist Count': 0.0,
                    'Day of Week': 0.0,
                    'Month': 0.0
                }
                
                for name, imp in zip(all_feature_names, importances):
                    if name.startswith('Area Name_'):
                        grouped_importances['Area Name'] += imp
                    elif name.startswith('Road/Intersection Name_'):
                        grouped_importances['Road/Intersection Name'] += imp
                    elif name.startswith('Weather Conditions_'):
                        grouped_importances['Weather Conditions'] += imp
                    elif name.startswith('Roadwork and Construction Activity_'):
                        grouped_importances['Roadwork and Construction Activity'] += imp
                    elif name == 'Traffic Volume':
                        grouped_importances['Traffic Volume'] += imp
                    elif name == 'Incident Reports':
                        grouped_importances['Incident Reports'] += imp
                    elif name == 'Pedestrian and Cyclist Count':
                        grouped_importances['Pedestrian and Cyclist Count'] += imp
                    elif name == 'Day_of_Week':
                        grouped_importances['Day of Week'] += imp
                    elif name == 'Month':
                        grouped_importances['Month'] += imp
                        
                # Round importances to percentages
                grouped_importances = {k: round(float(v) * 100, 2) for k, v in grouped_importances.items()}
                feature_importances[model_name][target] = grouped_importances
                
    # Save the models
    pipeline_path = os.path.join(assets_dir, "traffic_pipelines.joblib")
    joblib.dump(pipelines, pipeline_path)
    print(f"\nSaved all model pipelines to {pipeline_path}")
    
    # Save the metrics
    metrics_path = os.path.join(assets_dir, "metrics.json")
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=4)
    print(f"Saved evaluation metrics to {metrics_path}")
    
    # Save feature importances
    importances_path = os.path.join(assets_dir, "feature_importances.json")
    with open(importances_path, "w") as f:
        json.dump(feature_importances, f, indent=4)
    print(f"Saved feature importances to {importances_path}")
    
    # 6. Generate Data Summary and Aggregates for Dashboard
    print("\nGenerating aggregates and metadata for dashboard...")
    
    # Generate Area-Road Mapping
    area_road_map = {}
    for area in df['Area Name'].unique():
        roads = df[df['Area Name'] == area]['Road/Intersection Name'].unique().tolist()
        area_road_map[area] = sorted(roads)
        
    weather_list = sorted(df['Weather Conditions'].unique().tolist())
    
    total_records = len(df)
    avg_congestion = float(df['Congestion Level'].mean())
    avg_speed = float(df['Average Speed'].mean())
    total_incidents = int(df['Incident Reports'].sum())
    
    # Aggregate data for charts
    congestion_by_weather = df.groupby('Weather Conditions')['Congestion Level'].mean().round(2).to_dict()
    speed_by_weather = df.groupby('Weather Conditions')['Average Speed'].mean().round(2).to_dict()
    speed_by_area = df.groupby('Area Name')['Average Speed'].mean().round(2).to_dict()
    
    congestion_by_day = df.groupby('Day_of_Week')['Congestion Level'].mean().round(2).to_dict()
    day_map = {0: 'Monday', 1: 'Tuesday', 2: 'Wednesday', 3: 'Thursday', 4: 'Friday', 5: 'Saturday', 6: 'Sunday'}
    congestion_by_day = {day_map[k]: v for k, v in congestion_by_day.items()}
    
    roadwork_impact = df.groupby('Roadwork and Construction Activity')[['Congestion Level', 'Average Speed']].mean().round(2).to_dict()
    
    volume_bins = pd.cut(df['Traffic Volume'], bins=5)
    congestion_by_volume = df.groupby(volume_bins, observed=False)['Congestion Level'].mean().round(2).to_dict()
    congestion_by_volume = {f"{int(k.left)}-{int(k.right)}": v for k, v in congestion_by_volume.items()}
    
    summary_data = {
        "metadata": {
            "area_road_map": area_road_map,
            "weather_conditions": weather_list,
            "areas": sorted(list(area_road_map.keys()))
        },
        "kpis": {
            "total_records": total_records,
            "avg_congestion": round(avg_congestion, 2),
            "avg_speed": round(avg_speed, 2),
            "total_incidents": total_incidents
        },
        "charts": {
            "congestion_by_weather": congestion_by_weather,
            "speed_by_weather": speed_by_weather,
            "speed_by_area": speed_by_area,
            "congestion_by_day": congestion_by_day,
            "roadwork_impact": roadwork_impact,
            "congestion_by_volume": congestion_by_volume
        }
    }
    
    summary_path = os.path.join(assets_dir, "data_summary.json")
    with open(summary_path, "w") as f:
        json.dump(summary_data, f, indent=4)
    print(f"Saved dashboard data summary to {summary_path}")
    print("\nAll models trained successfully!")

if __name__ == "__main__":
    train_pipeline()
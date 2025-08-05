// 파이프라인 정의
pipeline {
    // Jenkins 에이전트를 모든 환경에서 실행하도록 설정
    agent {
        docker {
            // 이전에 빌드한 도커 이미지를 사용합니다.
            image 'backend-smart-contract:latest'
            // npm 캐시를 유지하여 종속성 설치 시간을 단축합니다.
            args '-v $HOME/.npm:/root/.npm'
        }
    }

    // Jenkins Credentials에 저장된 민감 정보들을 환경 변수로 설정합니다.
    environment {
        GIT_URL = "https://github.com/LG-CNS-2-FINAL-PROJECT-FINANCE/Backend_SmartContract.git"
        GITHUB_CREDENTIAL = "github-token"

        SEPOLIA_RPC_URL = credentials('SEPOLIA_RPC_URL')
        PRIVATE_KEY_ADMIN = credentials('PRIVATE_KEY_ADMIN')
        
        CHAINLINK_FUNCTIONS_SUBSCRIPTIONS = credentials('CHAINLINK_FUNCTIONS_SUBSCRIPTIONS')
        SEPOLIA_FUNCTIONS_ROUTER = credentials('SEPOLIA_FUNCTIONS_ROUTER')
        SEPOLIA_DON_ID = credentials('SEPOLIA_DON_ID')
        SEPOLIA_LINK_ADDR = credentials('SEPOLIA_LINK_ADDR')

        GELATO_TRUSTED_FORWARDER = credentials('GELATO_TRUSTED_FORWARDER')
        ETHERSCAN_API_KEY = credentials('ETHERSCAN_API_KEY')
                
        INVESTMENT_API_URL = credentials('INVESTMENT_API_URL')
        TRADE_API_URL = credentials('TRADE_API_URL')
    }

    // 사용자가 빌드 시 입력할 파라미터들을 정의합니다.
    parameters {
        string(name: 'TOKEN_NAME', description: 'The name of the token.')
        string(name: 'TOKEN_SYMBOL', description: 'The symbol of the token.')
        string(name: 'TOTAL_GOAL_AMOUNT', description: 'The total investment goal.')
        string(name: 'MIN_AMOUNT', description: 'The minimum investment amount.')
        string(name: 'TAG', defaultValue: 'main', description: 'The git branch or tag to build.') // <-- TAG 매개변수 재추가
    }

    // 파이프라인의 각 단계(stages)를 정의합니다.
    stages {
        // 코드 체크아웃 단계 추가
        stage('Checkout') {
            steps {
                echo "Checking out Git branch/tag: ${params.TAG}"
                checkout([
                    $class: 'GitSCM',
                    branches: [[name: "${params.TAG}"]],
                    userRemoteConfigs: [[credentialsId: "${GITHUB_CREDENTIAL}", url: "${GIT_URL}"]]
                ])            
            }
        }
        
        // 'Test' 단계: 스마트 컨트랙트 테스트를 실행합니다.
        stage('Test') {
            steps {
                echo 'Running tests...'
                sh 'npx hardhat test'
            }
        }
        
        // 'Deploy' 단계: 테스트가 성공하면 컨트랙트를 배포합니다.
        stage('Deploy') {
            steps {
                script {
                    echo 'Deploying contract to Sepolia network...'

                    // Hardhat 배포 스크립트를 실행하고, 파라미터를 환경 변수로 주입합니다.
                    def deployOutput = sh(returnStdout: true, script: """
                        TOKEN_NAME="${params.TOKEN_NAME}" \\
                        TOKEN_SYMBOL="${params.TOKEN_SYMBOL}" \\
                        TOTAL_GOAL_AMOUNT="${params.TOTAL_GOAL_AMOUNT}" \\
                        MIN_AMOUNT="${params.MIN_AMOUNT}" \\
                        npx hardhat run --network sepolia deploy/deploy.js
                    """)
                    
                    // 배포 결과(컨트랙트 주소)를 정규식을 사용해 파싱합니다.
                    def contractAddress = (deployOutput =~ /FractionalInvestmentToken deployed to (0x[a-fA-F0-9]{40})/).collect { it[1] }[0]
                    
                    echo "Deployed contract address: ${contractAddress}"
                    
                    // 배포 결과를 백엔드 서비스의 API로 전달합니다.
                    sh """
                        curl -X POST \\
                        -H "Content-Type: application/json" \\
                        -d '{
                                "address":"${contractAddress}",
                                "name":"${params.TOKEN_NAME}",
                                "symbol":"${params.TOKEN_SYMBOL}"
                            }' \\
                        https://your-backend-service.com/contracts/deploy-result
                    """
                }
            }
        }
    }
    
    // 파이프라인 완료 후 알림 설정
    post {
        success {
            echo 'Deployment Pipeline Succeeded!'
            // Slack, Discord 등으로 성공 알림 전송
        }
        failure {
            echo 'Deployment Pipeline Failed!'
            // Slack, Discord 등으로 실패 알림 전송
        }
    }
}
